import styles from "../../styles/addWallet.module.css"
import {Panes} from "./common";


const NetworkConfiguration = ({setPane}) => {
    const onBack = () => {
        setPane(Panes.Step1ChooseFile)
    }
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div><b>Edit network configuration</b></div>
            </div>
            <div className={styles.buttons}>
                <button onClick={onBack}>Back</button>
            </div>
        </div>
    )
}

export default NetworkConfiguration
