import {useEffect, useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";

const SeedTypeOptions = {
    Create: "create",
    Import: "import",
}

// The seed on display here is main's: asked for once when the pane mounts, and
// shown so it can be written down. Coming back to this pane is a fresh mount,
// which asks main for fresh words - the seed behind a step the person backed
// out of is not the seed they end up storing. A typed-in seed goes the other
// way exactly once, for main to validate and hold; whether it was a valid
// phrase is all that comes back.
const AddSeed = ({setPane, onBack}) => {
    const [hasOwnSeed, setHasOwnSeed] = useState(false)
    const [hasEnteredInvalidSeedPhrase, setHasEnteredInvalidSeedPhrase] = useState(false)
    const [seedWords, setSeedWords] = useState("")
    const userProvidedSeed = useRef()
    const defaultOption = useRef()
    useEffect(() => {
        defaultOption.current.checked = true
        window.electron.generateSeed().then(setSeedWords)
    }, [])
    const handleChooseAddSeed = (e) => {
        setHasOwnSeed(e.target.value !== SeedTypeOptions.Create)
    }
    const handleEnteredSeed = async () => {
        const imported = await window.electron.importSeed(userProvidedSeed.current.value)
        if (imported) {
            setPane(Panes.Step5SetPassword)
        } else {
            setHasEnteredInvalidSeedPhrase(true)
        }
    }
    const handleEditImportedSeed = () => {
        if (hasEnteredInvalidSeedPhrase) {
            setHasEnteredInvalidSeedPhrase(false)
        }
    }
    const onStoredSeed = () => {
        window.electron.clearClipboard()
        setPane(Panes.Step4ConfirmSeed)
    }
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>How would you like to add the seed for this wallet?</b></div>
                <div className={styles.boxMain}>
                    <div onChange={handleChooseAddSeed}>
                        <p><label>
                            <input ref={defaultOption} type="radio" name="seed" value={SeedTypeOptions.Create}/>
                            Create a new seed
                        </label></p>
                        <p><label>
                            <input type="radio" name="seed" value={SeedTypeOptions.Import}/>
                            I already have a seed
                        </label></p>
                    </div>
                    <div>
                        {hasOwnSeed ?
                            <div>
                                <p>Enter your 12-word seed phrase.</p>
                                <textarea key={"import"} className={styles.seedPhrase} ref={userProvidedSeed}
                                          onChange={handleEditImportedSeed}/>
                            </div>
                            :
                            <div>
                                <p>Here is the seed phrase for your new wallet:</p>
                                <textarea key={"generate"} className={styles.seedPhrase} value={seedWords} readOnly/>
                                <p>Store this seed securely. It will be used to recover your wallet.</p>
                            </div>
                        }
                        {hasEnteredInvalidSeedPhrase &&
                            <p>Please enter a valid seed phrase.</p>
                        }
                    </div>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={hasOwnSeed ? handleEnteredSeed : onStoredSeed}>
                    Next
                </button>
            </div>
        </div>
    )
}

export default AddSeed
