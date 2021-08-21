'use strict';

class Home extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return React.createElement(
            'div',
            null,
            React.createElement(
                'h1',
                null,
                'Memo Desktop!'
            ),
            React.createElement(
                'p',
                null,
                'We are using Node.js ',
                window.Versions.node,
                ', Chromium ',
                window.Versions.chrome,
                ', and Electron ',
                window.Versions.electron,
                '.'
            )
        );
    }
}

const domContainer = document.querySelector('#home');
ReactDOM.render(React.createElement(Home), domContainer);