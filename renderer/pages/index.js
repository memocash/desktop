import React, {useState} from 'react';
import ConnectForm from "../components/connect_form";
import ConnectStatus from "../components/connect_status";

const Home = () => {
    const [connected, setConnected] = useState(false)
    return (
        <div>
            <h1>Memo Desktop!</h1>
            <ConnectForm setConnected={setConnected}/>
            <ConnectStatus connected={connected}/>
        </div>
    )
}

export default Home
