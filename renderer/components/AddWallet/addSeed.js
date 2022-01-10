import {useRef, useState} from "react"

const SeedTypeOptions = {
    Create: "create",
    Import: "import",
}

const AddSeed = ({onStoredSeed, onUserProvidedSeed, onBack, seedPhrase}) => {
    const [hasOwnSeed, setHasOwnSeed] = useState(false)
    const [hasEnteredInvalidSeedPhrase, setHasEnteredInvalidSeedPhrase] = useState(false)
    const userProvidedSeed = useRef()

    const handleChooseAddSeed = (e) => {
        setHasOwnSeed(e.target.value !== SeedTypeOptions.Create)
    }

    const handleEnteredSeed = () => {
        const userSeed = userProvidedSeed.current.value
        const isInvalidSeedPhrase = onUserProvidedSeed(userSeed)
        if (isInvalidSeedPhrase) {
            setHasEnteredInvalidSeedPhrase(true)
        }
    }

    const handleEditImportedSeed = () => {
        if (hasEnteredInvalidSeedPhrase) {
            setHasEnteredInvalidSeedPhrase(false)
        }
    }

    const SeedOptionsCreate = () => {
        return (
            <div>
                <p>Here is the seed phrase for your new wallet:</p>
                <pre>{seedPhrase}</pre>
                <p>Store this seed securely. It will be used to recover your wallet.</p>
                <p>
                    <button onClick={onStoredSeed}>Next</button>
                </p>
            </div>
        )
    }

    const SeedOptionsImport = () => {
        return (
            <div>
                <div>Enter your 12-word seed phrase.</div>
                <textarea ref={userProvidedSeed} onChange={handleEditImportedSeed}/>
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
                    <input type="radio" name="seed" value={SeedTypeOptions.Create}/>
                </label>
                <label>I already have a seed
                    <input type="radio" name="seed" value={SeedTypeOptions.Import}/>
                </label>
            </div>
            <div>
                {hasOwnSeed ? <SeedOptionsImport/> : <SeedOptionsCreate/>}
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
