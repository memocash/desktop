import { useState } from "react"

const Login = () => {
    const [paneIndex, setPaneIndex] = useState(0)

    const handleClickNext = () => {
        setPaneIndex(paneIndex + 1)
    };

    const addWalletPanes = [(
        <div>
            <a href="/">Home</a>
            <h1>Add a Wallet</h1>
            <div>
                <label>Wallet name:
                    <input type="text" />
                </label>
                <button>Choose...</button>
            </div>
        </div>
    ), (
        <div>
            <h1>How do you want to add this wallet?</h1>
            <div>
                <label>Create a new wallet
                    <input type="radio" name="wallet" value="create" />
                </label>
                <label>Import a wallet
                    <input type="radio" name="wallet" value="import" />
                </label>
            </div>
        </div>
    ), (
        <div>
            <h1>Create a new seed? Or restore a wallet with an existing seed?</h1>
            <div>
                <label>Create a new seed
                    <input type="radio" name="seed" value="create" />
                </label>
                <label>Use existing seed
                    <input type="radio" name="seed" value="import" />
                </label>
            </div>
        </div>
    )]

    return (
        <div>
            {addWalletPanes[paneIndex]}
            <div>
                <button>Cancel</button>
                <button onClick={handleClickNext}>Next</button>
            </div>
        </div>
    )
}

export default Login
