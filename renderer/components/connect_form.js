import React, {useState} from 'react';

const ConnectForm = () => {
    const [connected, setConnected] = useState(false);
    const [response, setResponse] = useState("");
    const [error, setError] = useState("");
    const [url, setUrl] = useState("http://localhost:10000");
    const FormSubmit = (e) => {
        e.preventDefault();
        fetch(url, {mode: "no-cors"})
            .then(res => res.text())
            .then(res => {
                setConnected(true)
                setResponse(res)
                setError("")
            })
            .catch(err => {
                setError(err.toString())
                setConnected(false)
            })
    }
    const InputChange = (e) => {
        setUrl(e.target.value)
    }
    return (
        <form onSubmit={FormSubmit}>
            <label>
                Server
                <input type="text" value={url} onChange={InputChange}/>
            </label>
            <input type="submit" value="Connect"/>
            <p>Connected: {connected ? "Yes" : "No"}</p>
            {response ? <p>Response: {response}</p> : ""}
            {error ? <p>Error: {error}</p> : ""}
        </form>
    );
}

export default ConnectForm
