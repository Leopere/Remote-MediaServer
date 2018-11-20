const Settings = require('../Settings');
const Database = require('../Database');
const Log = require('../helpers/Log');
const extendedInfoQueue = require('../scanner/ExtendedInfoQueue').getInstance();
const fs = require('fs');
const EDHT = require('./EDHT');
const crypto = require('crypto');
const Crypt = require('./Crypt');
const DebugApiHandler = require('../requestHandlers/api/DebugApiHandler');
const { promisify } = require('util');

const stat = promisify(fs.stat);

/**
 * @todo, cache hashes locally
 */
class FileProcessor {
  constructor() {
    DebugApiHandler.registerDebugInfoProvider('sharing', this.debugInfo.bind(this));
    Settings.addObserver('libraries', this.publishDatabase.bind(this));
    EDHT.setOnreadyListener(this.onReady.bind(this));
    extendedInfoQueue.setOnDrain(this.publishDatabase.bind(this));
  }

  onReady() {
    this.publishDatabase();
    this.reannounce();
    setInterval(this.reannounce.bind(this), 30 * 60 * 1000);
  }

  async reannounce() {
    if (this.announcing) return;
    this.announcing = true;
    await this.doReannounce(FileProcessor.getAllSharedItems());
  }

  async doReannounce(items) {
    if (!items.length) {
      this.announcing = false;
      return;
    }
    const item = items.pop();
    try {
      await FileProcessor.putItem(item);
    } catch (e) {
      Log.debug(e);
    }
    this.doReannounce(items);
  }

  static getAllSharedItems() {
    const key = Settings.getValue('sharekey');
    const items = Database
      .getAll('media-item', true)
      .filter(item => !!item.attributes.shared);

    return JSON.parse(JSON.stringify(items))
      .map((item) => {
        item.originalId = item.id;
        item.id = `${key}-${item.id}`;
        item.attributes.libraryId = key;
        item.attributes.extension = item.attributes.filepath.replace(/^.*\.(.*)$/, '$1');
        item.attributes.filepath = `/download/${item.id}`;
        delete item.relationships;
        return item;
      });
  }

  publishDatabase() {
    if (!EDHT.ready) {
      return;
    }
    if (this.publishTimeout) {
      clearTimeout(this.publishTimeout);
    }
    this.publishTimeout = setTimeout(this.doPublishDatabase.bind(this), 1000);
  }

  async doPublishDatabase() {
    if (this.publishing) return;
    this.publishing = true;
    const changed = await this.publishDatabaseFiles();
    if (changed) {
      Log.debug('start write and publish edht database');
      fs.writeFile(
        'share/db',
        JSON.stringify(FileProcessor.getAllSharedItems()),
        () => {
          EDHT.publishDatabase(true);
        },
      );
    }
    this.publishing = false;
  }

  publishDatabaseFiles() {
    const libIds = Settings.getValue('libraries')
      .filter(lib => lib.shared && lib.shared !== 'off')
      .map(lib => lib.uuid);
    this.toProcess = Database.getAll('media-item', true)
      .filter(({ attributes }) => (
        libIds.indexOf(attributes.libraryId) !== -1 &&
        (!attributes.shared || !attributes.hashes) &&
        attributes.filesize &&
        attributes.fileduration
      ));
    if (!this.toProcess.length) return false;

    return new Promise(async (resolve) => {
      // first make sure we have a clientid
      await EDHT.publishDatabase();
      this.announceNext(resolve);
    });
  }

  async announceNext(resolve) {
    if (!this.toProcess.length) {
      return resolve(true);
    }

    const item = this.toProcess.pop();
    item.attributes.hashes = await FileProcessor.putItem(item);
    item.attributes.nonce = crypto.randomBytes(16).toString('hex');
    item.attributes.shared = true;
    Database.update('media-item', item);

    return this.announceNext(resolve);
  }

  static putItem(item) {
    const { filesize } = item.attributes;
    const parts = Math.ceil(item.attributes.fileduration / 200);
    const hashes = new Array(parts).fill('');
    // last chunks is smaller then the rest to help ffmpeg seeking
    let regularChunksSize = filesize;
    let lastChunkSize = regularChunksSize;
    if (parts > 1) {
      regularChunksSize = Math.ceil((filesize - 1000000) / (parts - 1));
      lastChunkSize = filesize - (regularChunksSize * (parts - 1));
    }


    return Promise.all(hashes.map(async (val, index) => {
      const buf = [
        Buffer.from(Settings.getValue('sharekey'), 'hex'),
        Buffer.alloc(6),
      ];
      buf[1].writeInt32BE(item.originalId || item.id);
      buf[1].writeInt16BE(index, 4);
      let hash = await EDHT.share(Buffer.concat(buf));
      hash = hash.toString('hex');

      const size = index === parts - 1 ? lastChunkSize : regularChunksSize;
      const offset = index * regularChunksSize;
      return { hash, size, offset };
    }));
  }

  async getReadStream(id, hash) {
    Log.debug('new request for file', id, hash, this.announcing);
    const item = Database.getById('media-item', id);
    let hashObj;
    if (item) {
      const { hashes } = item.attributes;
      if (hashes) {
        hashObj = hashes.find(h => h.hash === hash);
      }
    }
    if (!item || !item.attributes.shared || !hashObj) {
      // @todo this.registerDownload
      try {
        if (!hash.match(/^[0-9a-f]{40}$/)) return null;
        await stat(`share/${hash}`);
        this.registerDownload(hash);
        return fs.createReadStream(`share/${hash}`);
      } catch (e) {
        Log.debug('items or hashes not found');
        return null;
      }
    }

    const end = (hashObj.offset + hashObj.size) - 1;
    Log.debug('serving up', id, hashObj.offset, end);
    const filestream = fs.createReadStream(
      item.attributes.filepath,
      { start: hashObj.offset, end },
    );
    return Crypt.encrypt(
      filestream,
      Buffer.from(Settings.getValue('dbKey'), 'hex'),
      Buffer.from(item.attributes.nonce, 'hex'),
    );
  }

  /**
   * @todo (related to this) periodically rebroadcast downloaded files
   *
   * @param hash hex hash of file
   * @param size in bytes (not needed for existing chunks)
   */
  // eslint-disable-next-line class-methods-use-this
  registerDownload(hash, size = 0) {
    let [chunkObj] = Database.findBy('chunks', 'hash', hash);
    if (!chunkObj) { // first download
      chunkObj = { attributes: { hash, requested: 1, size } };
      Database.setObject('chunks', chunkObj);
      let totalSize = Database.getAll('chunks').reduce((acc, { attributes }) => acc + attributes.size, 0);
      totalSize /= 1000000;
      // to much space used?
      while (totalSize > Settings.getValue('sharespace')) {
        // get least requested
        const delChunk = Database.getAll('chunks').reduce((acc, i) => (
          i.attributes.requested > acc.attributes.requested ? i : acc
        ));
        fs.unlink(`share/${delChunk.hash}`, () => Log.debug('deleted', delChunk.hash));
        Database.deleteObject('chunks', delChunk);
      }
      return;
    }

    chunkObj.attributes.requested += 1;
    Database.update('chunks', chunkObj);
  }

  debugInfo() {
    return {
      announcing: this.announcing,
      publishQueueSize: this.toProcess ? this.toProcess.length : 0,
      publishing: this.publishing,
    };
  }
}

module.exports = new FileProcessor();
