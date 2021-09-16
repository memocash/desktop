import React, {useState} from 'react';
import LikeButton from "../components/like_button";

const Home = () => {
    const [node, chrome, electron] = useState(0);
    const node2 = process.versions["node"]
    return (
        <div>
            <h1>Memo Desktop!</h1>
            <p>
                We are using Node.js {node} - {node2},
                Chromium {chrome},
                and Electron {electron}.
            </p>
            <LikeButton/>
        </div>
    );
}

export default Home
