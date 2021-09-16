import React, {useState} from 'react';

const LikeButton = () => {
    const [liked, setLiked] = useState(false);
    if (liked) {
        return (
            <p>
                You liked this.
            </p>
        );
    }
    return (
        <button onClick={() => setLiked(true)}>
            Like
        </button>
    );
}

export default LikeButton
