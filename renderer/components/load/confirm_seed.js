import {useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";

const ConfirmSeed = ({seedPhrase, generateSeedPhrase, setPane}) => {
    const [isWrongSeedPhrase, setIsWrongSeedPhrase] = useState(false)
    const seedPhraseInput = useRef()
    const validateSeedPhrase = () => {
        const typedPhrase = seedPhraseInput.current.value.trim()
        if (typedPhrase === seedPhrase) {
            onSeedPhraseConfirmed()
        } else {
            setIsWrongSeedPhrase(true)
        }
    }
    const handleEditSeedPhrase = () => {
        if (isWrongSeedPhrase) {
            setIsWrongSeedPhrase(false)
        }
    }
    const onBack = () => {
        generateSeedPhrase()
        setPane(Panes.Step3SetSeed)
    }
    const onSeedPhraseConfirmed = () => setPane(Panes.Step5SetPassword)
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Confirm Seed</b></div>
                <div className={styles.boxMain}>
                    <p>Please type your seed here to confirm it has been stored.</p>
                    <textarea className={styles.seedPhrase} ref={seedPhraseInput} onChange={handleEditSeedPhrase}/>
                    {isWrongSeedPhrase &&
                        <p>That is the wrong seed phrase! Try again</p>
                    }
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={validateSeedPhrase}>Next</button>
            </div>
        </div>
    )
}

export default ConfirmSeed
