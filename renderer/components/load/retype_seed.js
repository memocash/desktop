import {useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";

// The typed phrase is checked by main against the seed it is holding, not
// against a copy kept here - the phrase that passes this step is the phrase
// the wallet will actually store. Going back lands on a remounted seed pane,
// which asks main for new words.
const RetypeSeed = ({setPane}) => {
    const [isWrongSeedPhrase, setIsWrongSeedPhrase] = useState(false)
    const seedPhraseInput = useRef()
    const validateSeedPhrase = async () => {
        const retyped = await window.electron.retypeSeed(seedPhraseInput.current.value)
        if (retyped) {
            setPane(Panes.Step5SetPassword)
        } else {
            setIsWrongSeedPhrase(true)
        }
    }
    const handleEditSeedPhrase = () => {
        if (isWrongSeedPhrase) {
            setIsWrongSeedPhrase(false)
        }
    }
    const onBack = () => setPane(Panes.Step3SetSeed)
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Retype Seed</b></div>
                <div className={styles.boxMain}>
                    <p>Type your seed again from where you stored it.</p>
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

export default RetypeSeed
