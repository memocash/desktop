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
                <div>Here is the seed phrase for your new wallet.</div>
                <div>{seedPhrase}</div>
                <div>Store this seed securely. It will be used to recover your wallet.</div>
                <button onClick={onStoredSeed}>Next</button>
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
                <button onClick={seedOnBack}>Back</button>
            </div>
        </div>
    )
}

export default AddSeed
