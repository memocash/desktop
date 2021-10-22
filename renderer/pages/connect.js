import { useState } from 'react';
import ConnectForm from "../components/connect_form";
import ConnectStatus from "../components/connect_status";

const Connect = () => {
    const [connected, setConnected] = useState(false)
    return (
        <div>
            <a href="/">Home</a>
            <h1>Memo Desktop!</h1>
            <ConnectForm setConnected={setConnected}/>
            <ConnectStatus connected={connected}/>
        </div>
    )
}

export default Connect
