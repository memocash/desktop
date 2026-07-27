import Modal, {ModalFooter} from "../modal";
import styles from "../../../styles/modal.module.css";
import {useEffect, useState} from "react";

const Homepage = "https://memo.cash"

const AboutModal = ({onClose}) => {
    const [app, setApp] = useState(null)
    useEffect(() => {(async () => {
        setApp(await window.electron.getAppInfo())
    })()}, [])
    return (
        <Modal onClose={onClose} title={"About Memo"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                <div className={styles.about}>
                    <img src="/memo-logo-large.png" alt="" className={styles.about_logo}/>
                    <div>
                        <p className={styles.text}>A desktop wallet for Bitcoin Cash and the Memo protocol.
                            Posts, replies, likes and chat are written on chain from keys held on this computer.</p>
                        {app === null ? null : <dl className={styles.details}>
                            <dt>Version</dt>
                            <dd>{app.version}</dd>
                            <dt>Platform</dt>
                            <dd>{app.platform} ({app.arch})</dd>
                            <dt>Electron</dt>
                            <dd>{app.electron} (Chromium {app.chrome}, Node {app.node})</dd>
                            <dt>Website</dt>
                            <dd><a href={Homepage} target={"_blank"} rel={"noreferrer"}>{Homepage}</a></dd>
                        </dl>}
                        <p className={styles.text}>© Memo Technology, Inc. Licensed under Apache 2.0.</p>
                    </div>
                </div>
                <ModalFooter>
                    <button onClick={onClose}>Close</button>
                </ModalFooter>
            </div>
        </Modal>
    )
}

export default AboutModal
