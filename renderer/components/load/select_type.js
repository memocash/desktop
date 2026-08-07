import {useState} from "react"
import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";

const TypeOptions = {
    Standard: "standard",
    Import: "import",
}

const SelectType = ({setPane, onChooseSeedWallet}) => {
    const [isStandard, setIsStandard] = useState(true)
    const changeWalletType = (e) => {
        setIsStandard(e.target.value === TypeOptions.Standard)
    }
    const handleClickNext = () => {
        if (isStandard) {
            // The seed pane asks main for the words itself; choosing the
            // standard type only decides which pane comes next.
            onChooseSeedWallet()
        } else {
            onSelectImport()
        }
    }
    const onSelectImport = () => setPane(Panes.Step3SetKeys)
    const onBack = () => setPane(Panes.Step1ChooseFile)
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Create Wallet</b></div>
                <div className={styles.boxMain}>
                    <p>What kind of wallet do you want to create?</p>
                    <div>
                        <p><label>
                            <input type="radio" name="type" value={TypeOptions.Standard} onChange={changeWalletType}
                                   checked={isStandard}/>
                            Standard wallet
                        </label></p>
                        <p><label>
                            <input type="radio" name="type" value={TypeOptions.Import} onChange={changeWalletType}
                                   checked={!isStandard}/>
                            Import Bitcoin addresses or private keys
                        </label></p>
                    </div>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
                <button onClick={handleClickNext}>Next</button>
            </div>
        </div>
    )
}

export default SelectType
