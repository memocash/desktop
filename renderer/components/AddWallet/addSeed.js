import {useRef, useState} from "react"

const AddSeed = ({
    onStoredSeed,
    onUserProvidedSeed,
    onBack,
    seedPhrase
}) => {
    const [addSeedMethod, setAddSeedMethod] = useState() // check intial value
    const [hasEnteredInvalidSeedPhrase, setHasEnteredInvalidSeedPhrase] = useState(false)

    const userProvidedSeed = useRef()

    const handleChooseAddSeed = (e) => {
        setAddSeedMethod(e.target.value)
    }

    const handleEnteredSeed = () => {
        const userSeed = userProvidedSeed.current.value
        const isInvalidSeedPhrase = onUserProvidedSeed(userSeed)
        if(isInvalidSeedPhrase) {
            setHasEnteredInvalidSeedPhrase(true)
        }
    }

    const handleEditImportedSeed = () => {
        if(hasEnteredInvalidSeedPhrase) {
            setHasEnteredInvalidSeedPhrase(false)
        }
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
                <textarea ref={userProvidedSeed} onChange={handleEditImportedSeed}></textarea>
                <p>
                    <button onClick={handleEnteredSeed}>Next</button>
                </p>
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
                {hasEnteredInvalidSeedPhrase &&
                    <div>Please enter a valid seed phrase.</div>
                }
                <p>
                    <button onClick={onBack}>Back</button>
                </p>
            </div>
        </div>
    )
}

export default AddSeed
