import styles from "../../../styles/addWallet.module.css";
import {useEffect, useRef, useState} from "react";
import {Panes} from "../common";
import {GetDefaultNetwork, GetNetworkOptions} from "./common";

const EditOption = "edit"

const NetworkForm = ({setPane, networkValueRef}) => {
    const [networkOptions, setNetworkOptions] = useState([])
    const selectRef = useRef()
    useEffect(async () => {
        const networkOptions = await GetNetworkOptions()
        setNetworkOptions(networkOptions)
        if (!networkValueRef.current || !networkValueRef.current.length) {
            networkValueRef.current = (await GetDefaultNetwork()).Id
        }
        selectRef.current.value = networkValueRef.current
    }, [])
    const onSelectChange = (e) => {
        if (e.target.value === EditOption) {
            e.target.value = networkValueRef.current
            setPane(Panes.NetworkConfiguration)
            return
        }
        networkValueRef.current = e.target.value
    }
    return (
        <form className={styles.network_form}>
            <label>Network</label>
            {networkOptions.length ? <>
                <select onChange={onSelectChange} ref={selectRef}>
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
