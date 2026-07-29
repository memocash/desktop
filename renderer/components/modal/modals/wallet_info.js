import Modal, {ModalFooter} from "../modal";
import styles from "../../../styles/modal.module.css";
import {useEffect, useState} from "react";
import GetWallet from "../../util/wallet";

// Read-only summary of the loaded wallet, opened from Wallet > Information.
const WalletInfoModal = ({onClose}) => {
    const [info, setInfo] = useState(null)
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const file = await window.electron.getWalletFileInfo()
        const network = await window.electron.getWindowNetwork()
        const addresses = wallet.addresses || []
        const changeList = wallet.changeList || []
        const slpList = wallet.slpList || []
        const balances = await window.electron.getWalletInfo(addresses.concat(changeList))
        const balance = balances.reduce((total, row) => total + row.balance, 0)
        setInfo({
            file, network, balance,
            addressCount: addresses.length,
            changeCount: changeList.length,
            slpCount: slpList.length,
            backup: wallet.walletType === "seed" ? "Seed phrase (BIP39)" :
                (wallet.walletType === "imported" ? "Imported keys" : "Watch only"),
        })
    })()}, [])
    return (
        <Modal onClose={onClose} title={"Wallet information"}>
            <div className={[styles.root, styles.rootWide].join(" ")}>
                {info === null ? <p>Loading...</p> : <dl className={styles.details}>
                    <dt>Wallet</dt>
                    <dd>{info.file.name}</dd>
                    <dt>File</dt>
                    <dd>{info.file.filename}</dd>
                    <dt>Encrypted</dt>
                    <dd>{info.file.encrypted ? "Yes, password protected" : "No"}</dd>
                    <dt>Backup</dt>
                    <dd>{info.backup}</dd>
                    <dt>Balance</dt>
                    <dd>{info.balance.toLocaleString()} satoshis</dd>
                    <dt>Addresses</dt>
                    <dd>{info.addressCount.toLocaleString()} receive,
                        {} {info.changeCount.toLocaleString()} change,
                        {} {info.slpCount.toLocaleString()} token</dd>
                    <dt>Network</dt>
                    <dd>{info.network && info.network.Name ? info.network.Name : "Unknown"}</dd>
                </dl>}
                <ModalFooter>
                    <button onClick={onClose}>Close</button>
                </ModalFooter>
            </div>
        </Modal>
    )
}

export default WalletInfoModal
