import {useEffect, useRef, useState} from "react"
import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";
import {validateMnemonic} from "bip39";

const SeedTypeOptions = {
    Create: "create",
    Import: "import",
}

const AddSeed = ({setPane, setSeedPhrase, onBack, seedPhrase}) => {
    const [hasOwnSeed, setHasOwnSeed] = useState(false)
    const [hasEnteredInvalidSeedPhrase, setHasEnteredInvalidSeedPhrase] = useState(false)
    const userProvidedSeed = useRef()
    const defaultOption = useRef()
    useEffect(() => {
        defaultOption.current.checked = true
    }, [])
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
    const onStoredSeed = () => {
        window.electron.clearClipboard()
        setPane(Panes.Step4ConfirmSeed)
    }
    const onUserProvidedSeed = (seed) => {
        const isValidSeed = validateMnemonic(seed)
        if (isValidSeed) {
            setSeedPhrase(seed)
            setPane(Panes.Step5SetPassword)
        } else {
            return true
        }
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
                                <textarea key={"generate"} className={styles.seedPhrase} value={seedPhrase} readOnly/>
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
