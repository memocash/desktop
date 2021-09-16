import React from 'react';

const ConnectStatus = ({connected}) => {
    return (
        <div>
            <p>Connected: {connected ? "Yes" : "No"}</p>
        </div>
    )
}

export default ConnectStatus
