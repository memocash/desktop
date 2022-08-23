import styles from "../../../styles/addWallet.module.css";
import {useRef, useState} from "react";
import {Panes} from "../common";
import {GetNetworkOptions} from "./common";

const EditOption = "edit"

const NetworkForm = ({setPane}) => {
    const [networkOptions] = useState(GetNetworkOptions())
    const selectValueRef = useRef(networkOptions[0].Id)
    const onSelectChange = (e) => {
        if (e.target.value === EditOption) {
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
                {networkOptions.map((option, i) => (
                    <option key={i} value={option.Id}>{option.Name}</option>
                ))}
                <option value={EditOption}>Edit networks...</option>
            </select>
        </form>
    )
}

export default NetworkForm
