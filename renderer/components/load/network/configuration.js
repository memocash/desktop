import styles from "../../../styles/addWallet.module.css"
import {Panes} from "../common";
import {GetNetworkOptions} from "./common";
import {useEffect, useRef, useState} from "react";

const NetworkConfiguration = ({setPane}) => {
    const [networkOptions, setNetworkOptions] = useState([])
    const [network, setNetwork] = useState({})
    const selectValueRef = useRef()
    const networkNameRef = useRef()
    const databaseFileRef = useRef()
    const serverRef = useRef()
    const formRef = useRef()
    const [invalidServerError, setInvalidServerError] = useState("")
    useEffect(async () => {
        const networkOptions = await GetNetworkOptions()
        setNetworkOptions(networkOptions)
        setNetwork(networkOptions[0])
    }, [])
    useEffect(() => {
        networkNameRef.current.value = network.Name
        formRef.current.elements.ruleset.value = network.Ruleset
        databaseFileRef.current.value = network.DatabaseFile
        serverRef.current.value = network.Server
    }, [network])
    const onSelectChange = () => {
        setNetwork(networkOptions.find(option => option.Id === selectValueRef.current.value))
    }
    const onFormSubmit = async (e) => {
        e.preventDefault()
        const serverError = validServerError(serverRef.current.value)
        if (serverError && serverError.length) {
            return
        }
        const elements = e.target.elements
        let networkConfig = {
            Networks: await GetNetworkOptions(),
        }
        let updatedNetwork
        networkConfig.Networks.map((item) => {
            if (network.Id === item.Id) {
                item.Name = networkNameRef.current.value
                item.Ruleset = elements.ruleset.value
                item.DatabaseFile = databaseFileRef.current.value
                item.Server = serverRef.current.value.replace(/[\/?]$/, "")
                updatedNetwork = item
            }
        })
        await window.electron.saveNetworkConfig(networkConfig)
        setNetworkOptions(networkConfig.Networks)
        setNetwork(updatedNetwork)
    }
    const validServerError = (server) => {
        if (!/^(http|https):\/\//.test(server)) {
            return "Server must have http/s"
        }
        let url;
        try {
            url = new URL(server)
        } catch (_) {
            return "Unable to parse server"
        }
        if (url.pathname.length > 0 && url.pathname !== "/") {
            return "Server path not allowed"
        } else if (url.search.length > 0) {
            return "Server search not allowed"
        }
        return ""
    }
    const onServerChange = () => {
        setInvalidServerError(validServerError(serverRef.current.value))
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
                    <form className={styles.config_right} onSubmit={onFormSubmit} ref={formRef}>
                        <div>
                            <label>Network name:</label>
                            <input type={"text"} ref={networkNameRef} disabled={true}/>
                        </div>
                        <div>
                            <label>Ruleset:</label>
                            <div>
                                <input type="radio" value="bch" name="ruleset" disabled={network.Id !== "dev"}/> BCH
                                <input type="radio" value="bsv" name="ruleset" disabled={network.Id !== "dev"}/> BSV
                            </div>
                        </div>
                        <div>
                            <label>Database file:</label>
                            <input type={"text"} ref={databaseFileRef} disabled={true}/>
                        </div>
                        <div>
                            <label>Server:</label>
                            <input type={"text"} ref={serverRef} onChange={onServerChange}/>
                        </div>
                        <div>
                            <label></label>
                            <div>
                                <input type={"submit"} value={"Save"}/>
                                <span className={styles.error}>{invalidServerError}</span>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={() => setPane(Panes.Step1ChooseFile)}>Back</button>
            </div>
        </div>
    )
}

export default NetworkConfiguration
