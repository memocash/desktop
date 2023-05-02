import Modal from "../modal";
import {useEffect, useState} from "react";

const NetworkView = ({onClose}) => {
    const [network, setNetwork] = useState({})
    useEffect(() => {(async () => {
        const network = await window.electron.getWindowNetwork()
        setNetwork(network)
    })()}, [])
    return (
        <Modal onClose={onClose}>
            <h3>Network Info</h3>
            {network.Name ? <div>
                <p><b>Name</b> {network.Name}</p>
                <p><b>Server</b> {network.Server}</p>
                <p><b>Ruleset</b> {network.Ruleset}</p>
                <p><b>Database File</b> {network.DatabaseFile}</p>
            </div> : ""}
        </Modal>
    )
}

export default NetworkView
