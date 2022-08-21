import styles from "../../styles/addWallet.module.css";
import {useRef} from "react";
import {Panes} from "./common";

const NetworkOptions = {
    BCH: "bch",
    BSV: "bsv",
    Dev: "dev",
    Edit: "edit",
}

const NetworkForm = ({setPane}) => {
    const selectValueRef = useRef(NetworkOptions.BCH)
    const onSelectChange = (e) => {
        if (e.target.value === "edit") {
            e.target.value = selectValueRef.current
            setPane(Panes.NetworkConfiguration)
            return
        }
        selectValueRef.current = e.target.value
    }
    return (
        <form className={styles.network_form}>
            <label>Network</label>
            <select onChange={onSelectChange}>
                <option value={NetworkOptions.BCH}>BCH</option>
                <option value={NetworkOptions.BSV}>BSV</option>
                <option value={NetworkOptions.Dev}>Dev</option>
                <option value={NetworkOptions.Edit}>Edit networks...</option>
            </select>
        </form>
    )
}

export default NetworkForm
