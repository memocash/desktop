'use strict';

class Home extends React.Component {
    constructor(props) {
        super(props);
    }

    render() {
        return (
            <div>
                <h1>Memo Desktop!</h1>
                <p>
                    We are using Node.js {window.Versions.node},
                    Chromium {window.Versions.chrome},
                    and Electron {window.Versions.electron}.
                </p>
            </div>
        );
    }
}

const domContainer = document.querySelector('#home');
ReactDOM.render(React.createElement(Home), domContainer);
