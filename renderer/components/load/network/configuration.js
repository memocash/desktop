import styles from "../../../styles/addWallet.module.css"
import {Panes} from "../common";
import {GetNetworkOptions} from "./common";
import {useRef, useState} from "react";

const NetworkConfiguration = ({setPane}) => {
    const [networkOptions] = useState(GetNetworkOptions())
    const [network, setNetwork] = useState(networkOptions[0])
    const selectValueRef = useRef()
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
                        <p>
                            <label>Network name:</label>
                            <input type={"text"} value={network.Name}/>
                        </p>
                        <p>
                            <label>Ruleset:</label>
                            <input type="radio" value="bch" name="ruleset"/> BCH
                            <input type="radio" value="bsv" name="ruleset"/> BSV
                        </p>
                        <p>
                            <label>Database file:</label>
                            <input type={"text"} value={""}/>
                        </p>
                        <p>
                            <label>Server:</label>
                            <input type={"text"} value={""}/>
                        </p>
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
