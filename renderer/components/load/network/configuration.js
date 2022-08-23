import styles from "../../../styles/addWallet.module.css"
import {Panes} from "../common";
import {GetNetworkOptions} from "./common";
import {useEffect, useRef, useState} from "react";

const NetworkConfiguration = ({setPane}) => {
    const [networkOptions] = useState(GetNetworkOptions())
    const [network, setNetwork] = useState(networkOptions[0])
    const selectValueRef = useRef()
    const networkNameRef = useRef()
    useEffect(() => {
        networkNameRef.current.value = network.Name
    }, [network])
    const onSelectChange = () => {
        setNetwork(networkOptions.find(option => option.Id === selectValueRef.current.value))
    }
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div className={styles.config_title}>Edit network configuration</div>
                <div className={styles.config_container}>
                    <div className={styles.config_left}>
                        <select size={5} ref={selectValueRef} onClick={onSelectChange}>
                            {networkOptions.map((option, i) => (
                                <option key={i} value={option.Id}>{option.Name}</option>
                            ))}
                        </select>
                    </div>
                    <div className={styles.config_right}>
                        <div>
                            <label>Network name:</label>
                            <input type={"text"} ref={networkNameRef}/>
                        </div>
                        <div>
                            <label>Ruleset:</label>
                            <div>
                                <input type="radio" value="bch" name="ruleset"/> BCH
                                <input type="radio" value="bsv" name="ruleset"/> BSV
                            </div>
                        </div>
                        <div>
                            <label>Database file:</label>
                            <input type={"text"}/>
                        </div>
                        <div>
                            <label>Server:</label>
                            <input type={"text"}/>
                        </div>
                        <div>
                            <label></label>
                            <div>
                                <input type={"submit"} value={"Save"}/>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setPane(Panes.Step1ChooseFile)}>Back</button>
            </div>
        </div>
    )
}

export default NetworkConfiguration
