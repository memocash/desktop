import {useState} from "react"

const AddSeed = ({
    onStoredSeed,
    seedOnBack,
    seedPhrase
}) => {
    const [addSeedMethod, setAddSeedMethod] = useState() // check intial value

    const handleChooseAddSeed = (e) => {
        setAddSeedMethod(e.target.value)
    }

    const seedOptions = {
        create: (
            <div>
                <p>Here is the seed phrase for your new wallet:</p>
                <pre>{seedPhrase}</pre>
                <p>Store this seed securely. It will be used to recover your wallet.</p>
                <p>
                    <button onClick={onStoredSeed}>Next</button>
                </p>
            </div>
        ),
        import: (
            <div>
                <div>Enter your 12-word seed phrase.</div>
                <textarea></textarea>
            </div>
        )
    }

    return (
        <div>
            <h2>How would you like to add the seed for this wallet?</h2>
            <div onChange={handleChooseAddSeed}>
                <label>Create a new seed
                    <input type="radio" name="seed" value="create" />
                </label>
                <label>I already have a seed
                    <input type="radio" name="seed" value="import" />
                </label>
            </div>
            <div>
                {seedOptions[addSeedMethod]}
                <p>
                    <button onClick={seedOnBack}>Back</button>
                </p>
            </div>
        </div>
    )
}

export default AddSeed
