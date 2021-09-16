import React, { useState } from 'react';
import ReactDOM from 'react-dom';

Home = () => {
    const [node, chrome, electron] = useState(0);
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
            node,
            ', Chromium ',
            chrome,
            ', and Electron ',
            electron,
            '.'
        )
    );
};

ReactDOM.render(React.createElement(Home, null), document.querySelector('#home'));