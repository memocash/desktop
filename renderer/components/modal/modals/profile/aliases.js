import {useEffect, useRef, useState} from "react";
import {opcodes, script} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import Modal from "../../modal";
import css from "../../../../styles/account_links.module.css";
import styles from "../../../../styles/modal.module.css";
import bitcoin from "../../../util/bitcoin";
import GetWallet from "../../../util/wallet";
import {CreateTransaction} from "../../../wallet/snippets/create_tx";
import {SyncAliases, SyncProfileLinks} from "../../../wallet/update/index";

const MaxAliasBytes = bitcoin.Fee.MaxOpReturn - 21

const Aliases = ({basic: {setModal, onClose}}) => {
    const [addresses, setAddresses] = useState([])
    const [aliases, setAliases] = useState({})
    const [loading, setLoading] = useState(true)
    const walletRef = useRef()
    const signerRef = useRef()
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        walletRef.current = wallet
        const walletAddresses = wallet.addresses.concat(wallet.changeList || [])
        let linked
        try {
            linked = await SyncProfileLinks({addresses: walletAddresses})
        } catch (e) {
            console.log("Aliases modal: link sync failed, showing local data", e)
            linked = await window.electron.getLinkedAddresses(walletAddresses)
        }
        const links = await window.electron.getWalletLinks(linked)
        const activeLinks = links.filter(link => link.accept_tx_hash && !link.revoked)
        const identityAddresses = [...new Set(activeLinks.flatMap(link =>
            [link.child_address, link.parent_address]))]
        signerRef.current = walletAddresses.find(walletAddress => activeLinks.some(link =>
            link.parent_address === walletAddress)) || wallet.addresses[0]
        let rows
        try {
            rows = await SyncAliases({addresses: identityAddresses})
        } catch (e) {
            console.log("Aliases modal: alias sync failed, showing local data", e)
            rows = await window.electron.getAddressAliases(identityAddresses)
        }
        setAddresses(identityAddresses)
        setAliases(Object.fromEntries(rows.map(row => [row.target_address, row.alias])))
        setLoading(false)
    })()}, [])
    const setAlias = async (targetAddress) => {
        const alias = (aliases[targetAddress] || "").trim()
        if (!alias.length) {
            return
        }
        if (Buffer.byteLength(alias, "utf8") > MaxAliasBytes) {
            await window.electron.showMessageDialog("Alias is too long (max: " + MaxAliasBytes + " bytes)")
            return
        }
        const aliasOutput = script.compile([
            opcodes.OP_RETURN,
            Buffer.from(bitcoin.Prefix.SetAlias, "hex"),
            Buffer.from(bitcoin.GetPkHashFromAddress(targetAddress), "hex"),
            Buffer.from(alias),
        ])
        await CreateTransaction(walletRef.current, [{script: aliasOutput}], setModal, null, "", false,
            signerRef.current)
    }
    return <Modal onClose={onClose}>
        <div className={css.wrapper}>
            <div className={css.title}>Address Aliases</div>
            <div className={css.section}>
                <div className={css.sectionHeader}>
                    <span>Linked identity addresses</span>
                    <span className={css.count}>{addresses.length}</span>
                </div>
                <div className={css.list}>
                    {addresses.map(address => <div className={css.row} key={address}>
                        <div className={css.identity}>
                            <div className={css.sub}>{address}</div>
                            <input value={aliases[address] || ""} placeholder={"Alias"}
                                   onChange={e => setAliases({...aliases, [address]: e.target.value})}/>
                        </div>
                        <div className={css.actions}>
                            <button onClick={() => setAlias(address)}>Set alias</button>
                        </div>
                    </div>)}
                    {!addresses.length && <div className={css.empty}>
                        {loading ? "Loading…" : "No identity addresses"}</div>}
                </div>
            </div>
            <div className={styles.buttons}><button onClick={onClose}>Close</button></div>
        </div>
    </Modal>
}

export default Aliases
