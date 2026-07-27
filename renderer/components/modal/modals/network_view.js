import Modal, {ModalFooter} from "../modal";
import styles from "../../../styles/modal.module.css";
import {useEffect, useState} from "react";

const NetworkView = ({onClose}) => {
    const [network, setNetwork] = useState({})
    return (
        <Modal onClose={onClose} title={"Network"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <NetworkRows network={network} setNetwork={setNetwork}/>
                <ModalFooter>
                    <button onClick={onClose}>Close</button>
                </ModalFooter>
            </div>
        </Modal>
    )
}

const NetworkRows = ({network, setNetwork}) => {
    useEffect(() => {(async () => {
        setNetwork(await window.electron.getWindowNetwork())
    })()}, [])
    if (!network.Name) {
        return null
    }
    return (
        <dl className={styles.details}>
            <dt>Name</dt>
            <dd>{network.Name}</dd>
            <dt>Server</dt>
            <dd>{network.Server}</dd>
            <dt>Ruleset</dt>
            <dd>{network.Ruleset}</dd>
            <dt>Database file</dt>
            <dd>{network.DatabaseFile}</dd>
        </dl>
    )
}

export default NetworkView
