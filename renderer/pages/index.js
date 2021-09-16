import React, {useState} from 'react';
import LikeButton from "../components/like_button";
import ConnectForm from "../components/connect_form";

const Home = () => {
    const [node, setNode] = useState(0);
    const [chrome, setChrome] = useState(0);
    const [electron, setElectron] = useState(0);
    React.useEffect(() => {
        setNode(window.Versions["node"])
        setChrome(window.Versions["chrome"])
        setElectron(window.Versions["electron"])
    })
    return (
        <div>
            <h1>Memo Desktop!</h1>
            <p>
                We are using Node.js {node},
                Chromium {chrome},
                and Electron {electron}.
            </p>
            <ConnectForm/>
            <LikeButton/>
        </div>
    );
}

export default Home
