import React, {Component} from 'react'
import {inject, observer} from 'mobx-react'

@inject("store") @observer
export default class Library extends Component {

    constructor(props) {
        super(props);
        this.store = this.props.store
    }

    render() {
        const store = this.store
        return (
            <div className="page library">
                <div className="container">
                    <header className="grid header">
                       Lirbrary
                    </header>
                </div>
            </div>
        )
    }

}
