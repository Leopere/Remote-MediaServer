import React, {Component} from 'react'
import {inject, observer} from 'mobx-react'
import {Link} from 'react-router-dom'
import injectTapEventPlugin from 'react-tap-event-plugin'
import { browserHistory } from 'react-router';

import AppBar from 'material-ui/AppBar'
import IconButton from 'material-ui/IconButton'
import FontIcon from 'material-ui/FontIcon'
import FlatButton from 'material-ui/FlatButton'

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
injectTapEventPlugin();

@inject("store") @observer
export default class TopBar extends Component {

    constructor(props) {
        super(props);
        this.store = this.props.store
        this.history = this.props.history
    }

    authenticate(e) {
        if (e) e.preventDefault();
        console.log('CLICKED BUTTON')
        this.store.authenticate()
    }

    iconButtonContainerStyle = {
        marginRight: "10px",
        marginLeft: "10px"
    }

    alert() {
        this.history.push('/library')
    }

    render() {
        const {authenticated} = this.store
        return (
            <AppBar
                title={<span>My Media Server</span>}
                className="appbar"
                showMenuIconButton={false}
                iconStyleRight={{
                    marginTop: "0px",
                    marginRight: "0px",
                }}
                iconElementRight={
                    <div className="appbar-icons">

                        <IconButton
                            style={this.iconButtonContainerStyle}
                            tooltip="Home"
                            tooltipPosition="bottom-center">
                            <FontIcon className="material-icons"
                                      color="white">home</FontIcon>
                        </IconButton>

                        <IconButton
                            style={this.iconButtonContainerStyle}
                            tooltip="Library"
                            tooltipPosition="bottom-center"
                            onTouchTap={this.alert}>
                            <FontIcon className="material-icons"
                                      color="white">video_library</FontIcon>
                        </IconButton>

                        <IconButton
                            style={this.iconButtonContainerStyle}
                            tooltip="Settings"
                            tooltipPosition="bottom-center">
                            <FontIcon className="material-icons"
                                      color="white">settings</FontIcon>
                        </IconButton>

                    </div>
                } >
            </AppBar>

        )
    }

}
