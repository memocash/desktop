import {useRef, useState} from "react"

const ConfirmSeed = ({
    onBack,
    onSeedPhraseConfirmed,
    seedPhrase
}) => {
    const [isWrongSeedPhrase, setIsWrongSeedPhrase] = useState(false)

    const seedPhraseInput = useRef()

    const validateSeedPhrase = () => {
        const typedPhrase = seedPhraseInput.current.value
        if(typedPhrase.includes(seedPhrase)) {
            onSeedPhraseConfirmed()
        } else {
            setIsWrongSeedPhrase(true)
        }
    }

    return (
        <div>
            <h2>Confirm Seed</h2>
            <div>Please type your seed here to confirm it has been stored.</div>
            <textarea ref={seedPhraseInput}></textarea>
            <button onClick={validateSeedPhrase}>Next</button>
            {isWrongSeedPhrase &&
                <div>That is the wrong seed phrase! Try again</div>
            }
            <p>
                <button onClick={onBack}>Back</button>
            </p>
        </div>
    )
}

export default ConfirmSeed
