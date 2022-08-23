import styles from "../../../styles/addWallet.module.css";
import {useEffect, useRef, useState} from "react";
import {Panes} from "../common";
import {GetNetworkOptions} from "./common";

const EditOption = "edit"

const NetworkForm = ({setPane}) => {
    const [networkOptions, setNetworkOptions] = useState([])
    const selectValueRef = useRef()
    useEffect(async () => {
        const networkOptions = await GetNetworkOptions()
        setNetworkOptions(networkOptions)
        selectValueRef.current = networkOptions[0].Id
    }, [])
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
            {networkOptions.length ? <>
                <select onChange={onSelectChange}>
                    {networkOptions.map((option, i) => (
                        <option key={i} value={option.Id}>{option.Name}</option>
                    ))}
                    <option value={EditOption}>Edit networks...</option>
                </select>
            </> : ": Loading..."}
        </form>
    )
}

export default NetworkForm
