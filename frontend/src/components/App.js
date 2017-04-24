import React, {Component} from 'react'
import {BrowserRouter as Router, Route, Link} from 'react-router-dom'
import {Provider, observer} from 'mobx-react'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider'
import LazyRoute from 'lazy-route'
import DevTools from 'mobx-react-devtools'
import {createBrowserHistory} from 'history';

import TopBar from './TopBar'

@observer
export default class App extends Component {

    constructor(props) {
        super(props)
        this.store = this.props.store
        this.browserHistory = createBrowserHistory();
    }

    componentDidMount() {
        this.authenticate()
    }

    authenticate(e) {
        if (e) e.preventDefault();
    }

    render() {
        return (
            <Router history={this.browserHistory}>
                <MuiThemeProvider>
                    <Provider store={this.store}>
                        <div className="wrapper">
                            {/*<DevTools />*/}

                            <TopBar />

                            <Route
                                exact
                                path="/"
                                render={(props) => <LazyRoute {...props} component={import('./Home')}/>}
                            />

                            <Route
                                exact
                                path="library"
                                render={(props) => <LazyRoute {...props} component={import('./Library')}/>}
                            />

                        </div>
                    </Provider>
                </MuiThemeProvider>
            </Router>
        )
    }
}
