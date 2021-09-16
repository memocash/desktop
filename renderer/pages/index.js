import React from 'react';
import LikeButton from "../components/like_button";
import ConnectForm from "../components/connect_form";

const Home = () => {
    return (
        <div>
            <h1>Memo Desktop!</h1>
            <ConnectForm/>
            <LikeButton/>
        </div>
    );
}

export default Home
