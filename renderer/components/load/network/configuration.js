import styles from "../../../styles/addWallet.module.css"
import {Panes} from "../common";
import {GetNetworkConfig, GetNetworkOptions, SaveNetworkConfig} from "./common";
import {NextSelection, ServerError, SubmitNetworkForm} from "./selector_core";
import {useEffect, useRef, useState} from "react";

const NetworkConfiguration = ({setPane}) => {
    const [hasChanged, setHasChanged] = useState(false)
    const [networkOptions, setNetworkOptions] = useState([])
    const [network, setNetwork] = useState({})
    const selectValueRef = useRef()
    const networkNameRef = useRef()
    const databaseFileRef = useRef()
    const serverRef = useRef()
    const formRef = useRef()
    const [formError, setFormError] = useState("")
    useEffect(() => {(async () => {
        const networkOptions = await GetNetworkOptions()
        setNetworkOptions(networkOptions)
        setNetwork(networkOptions[0])
        selectValueRef.current.value = networkOptions[0].Id
    })()}, [])
    useEffect(() => {
        resetForm()
    }, [network])
    const resetForm = () => {
        networkNameRef.current.value = network.Name
        formRef.current.elements.ruleset.value = network.Ruleset
        databaseFileRef.current.value = network.DatabaseFile
        serverRef.current.value = network.Server
        checkFormDifference()
    }
    const onSelectChange = () => {
        const confirmMessage = "" +
            "You have unsaved changes.\n" +
            "Are you sure you want to select another network?\n" +
            "Changes will be lost."
        const next = NextSelection({
            options: networkOptions,
            currentId: network.Id,
            nextId: selectValueRef.current.value,
            hasChanged,
            confirmDiscard: () => confirm(confirmMessage),
        })
        if (next.revertTo !== undefined) {
            selectValueRef.current.value = next.revertTo
            return false
        }
        setNetwork(next.network)
    }
    const onFormSubmit = async (e) => {
        e.preventDefault()
        const serverError = ServerError(serverRef.current.value)
        if (serverError && serverError.length) {
            return
        }
        // Main validates again before writing, so a save it refuses has to say
        // so here - swallowing the rejection left the form looking saved while
        // the file still held the old server. A refused submit returns nothing,
        // so the state updates below cannot run on it.
        try {
            const {networkConfig, updatedNetwork} = await SubmitNetworkForm({
                getConfig: GetNetworkConfig,
                save: SaveNetworkConfig,
                networkId: network.Id,
                values: {
                    Name: networkNameRef.current.value,
                    Ruleset: e.target.elements.ruleset.value,
                    DatabaseFile: databaseFileRef.current.value,
                    Server: serverRef.current.value,
                },
            })
            setNetworkOptions(networkConfig.Networks)
            setNetwork(updatedNetwork)
        } catch (error) {
            setFormError(error.message)
        }
    }
    const onFormChange = () => {
        checkFormDifference()
    }
    const checkFormDifference = () => {
        setFormError(ServerError(serverRef.current.value))
        if (network.Server !== serverRef.current.value ||
            formRef.current.elements.ruleset.value !== network.Ruleset ||
            networkNameRef.current.value !== network.Name ||
            databaseFileRef.current.value !== network.DatabaseFile) {
            setHasChanged(true)
        } else {
            setHasChanged(false)
        }
    }
    const clickBack = () => {
        const confirmMessage = "" +
            "You have unsaved changes.\n" +
            "Are you sure you want to go back?\n" +
            "Changes will be lost."
        if (hasChanged && !confirm(confirmMessage)) {
            return false
        }
        setPane(Panes.Step1ChooseFile)
    }
    return (
        <div className={styles.root}>
            <div className={styles.box}>
                <div className={styles.config_title}>Edit network configuration</div>
                <div className={styles.config_container}>
                    <div className={styles.config_left}>
                        <select size={5} ref={selectValueRef} onChange={onSelectChange}>
                            {networkOptions.map((option, i) => (
                                <option key={i} value={option.Id}>
                                    {option.Name}
                                    {option.Id === network.Id && hasChanged ? " *" : ""}
                                </option>
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
                                <label>
                                    <input type="radio" value="bch" name="ruleset" disabled={network.Id !== "dev"}
                                           onChange={onFormChange}/> BCH
                                </label>
                                <label>
                                    <input type="radio" value="bsv" name="ruleset" disabled={network.Id !== "dev"}
                                           onChange={onFormChange}/> BSV
                                </label>
                            </div>
                        </div>
                        <div>
                            <label>Database file:</label>
                            <input type={"text"} ref={databaseFileRef} disabled={true}/>
                        </div>
                        <div>
                            <label>Server:</label>
                            <input type={"text"} ref={serverRef} onChange={onFormChange}/>
                        </div>
                        <div>
                            <label></label>
                            <div>
                                <input type={"submit"} value={"Save"} disabled={!hasChanged}/>
                                {/* Without a type, a button in a form submits it:
                                    Reset used to save the form right after resetting it. */}
                                <button type={"button"} onClick={resetForm} disabled={!hasChanged}>Reset</button>
                                <div className={styles.error}>{formError}</div>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
            <div className={styles.buttons}>
                <button onClick={clickBack}>Done</button>
            </div>
        </div>
    )
}

export default NetworkConfiguration
