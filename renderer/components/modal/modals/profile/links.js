import {useEffect, useRef, useState} from "react";
import Modal from "../../modal";
import styles from "../../../../styles/modal.module.css";
import css from "../../../../styles/account_links.module.css";
import GetWallet from "../../../util/wallet";
import ShortHash from "../../../util/txs";
import {Modals} from "../../../../../main/common/util";
import {SendLinkAccept, SendLinkRequest, SendLinkRevoke} from "../../../wallet/snippets/link_tx";
import SyncProfileLinks, {DiscoverLinkRequests} from "../../../wallet/update/links";

// Account links overview: active links (revokable), pending requests in both
// directions (incoming ones acceptable), and a form to request a new link.
const Links = ({basic: {setModal, onClose}}) => {
    const [activeLinks, setActiveLinks] = useState([])
    const [pendingLinks, setPendingLinks] = useState([])
    const [loading, setLoading] = useState(true)
    const addressInputRef = useRef()
    const messageInputRef = useRef()
    useEffect(() => {(async () => {
        const wallet = await GetWallet()
        const addresses = wallet.addresses.concat(wallet.changeList || [])
        let linkedAddresses
        try {
            await DiscoverLinkRequests({addresses})
            linkedAddresses = await SyncProfileLinks({addresses})
        } catch (e) {
            console.log("Links modal: sync failed, showing local data", e)
            linkedAddresses = await window.electron.getLinkedAddresses(addresses)
        }
        // Read every edge touching the resolved identity cluster, not only
        // edges connected directly to an address owned by this wallet.
        const rows = await window.electron.getWalletLinks(linkedAddresses)
        // Best row per request: an unrevoked accept beats a revoked one beats
        // none (a revoked accept can be superseded by a re-accept).
        const requestRows = {}
        for (const row of rows) {
            const existing = requestRows[row.request_tx_hash]
            if (!existing || (row.accept_tx_hash && !row.revoked) ||
                (row.accept_tx_hash && !existing.accept_tx_hash)) {
                requestRows[row.request_tx_hash] = row
            }
        }
        const active = []
        const pending = []
        for (const row of Object.values(requestRows)) {
            const walletIsParent = addresses.includes(row.parent_address)
            const walletIsChild = addresses.includes(row.child_address)
            const entry = {
                ...row,
                walletIsParent,
                walletIsChild,
                indirect: !walletIsParent && !walletIsChild,
                otherAddress: walletIsParent ? row.child_address : row.parent_address,
                otherName: walletIsParent ? row.child_name : row.parent_name,
                walletAddress: walletIsParent ? row.parent_address :
                    (walletIsChild ? row.child_address : undefined),
            }
            if (row.accept_tx_hash && !row.revoked) {
                active.push(entry)
            } else {
                pending.push(entry)
            }
        }
        setActiveLinks(active)
        setPendingLinks(pending)
        setLoading(false)
    })()}, [])
    const clickTxLink = async (txHash) => {
        await window.electron.openTransaction({txHash})
    }
    const viewProfile = (address) => setModal(Modals.ProfileView, {address})
    const clickAccept = (entry) => SendLinkAccept({
        requestTxHash: entry.request_tx_hash, walletAddress: entry.walletAddress, setModal})
    const clickRevoke = (entry) => SendLinkRevoke({
        acceptTxHash: entry.accept_tx_hash, walletAddress: entry.walletAddress, setModal})
    const clickRequest = async () => {
        const parentAddress = addressInputRef.current.value.trim()
        const message = messageInputRef.current.value.trim()
        if (!parentAddress.length) {
            return
        }
        try {
            await SendLinkRequest({parentAddress, message, setModal})
        } catch (e) {
            console.log("SendLinkRequest failed", e)
            await window.electron.showMessageDialog("Invalid address: " + parentAddress)
        }
    }
    const handleKeyDown = (e) => e.keyCode === 13 && clickRequest()
    // A named account shows the name as the identity and the address beneath;
    // an unnamed one shows the address as the identity with no duplicate line.
    const named = (entry) => entry.otherName && entry.otherName.length
    const identityLink = (address, name) => <span className={css.name} onClick={() => viewProfile(address)}>
        {name || address}
    </span>
    const linkRow = (entry, badge, action) => (
        <div className={css.row} key={entry.request_tx_hash}>
            <div className={css.identity}>
                {entry.indirect ? <>
                    {identityLink(entry.child_address, entry.child_name)}
                    <span> &rarr; </span>
                    {identityLink(entry.parent_address, entry.parent_name)}
                </> : identityLink(entry.otherAddress, entry.otherName)}
                <div className={css.sub}>
                    {!entry.indirect && named(entry) ? <div>{entry.otherAddress}</div> : null}
                    {entry.indirect && (entry.child_name || entry.parent_name) ?
                        <div>{entry.child_address} &rarr; {entry.parent_address}</div> : null}
                    {(entry.message && entry.message.length) ?
                        <span className={css.message}>&ldquo;{entry.message}&rdquo;</span> : null}
                </div>
                {badge}
            </div>
            <div className={css.actions}>
                <a className={css.txLink}
                   title={"View transaction"}
                   onClick={() => clickTxLink(entry.accept_tx_hash || entry.request_tx_hash)}>
                    {ShortHash(entry.accept_tx_hash || entry.request_tx_hash)}
                </a>
                {action}
            </div>
        </div>
    )
    return (
        <Modal onClose={onClose}>
            <div className={css.wrapper}>
                <div className={css.title}>Account Links</div>
                <div className={css.section}>
                    <div className={css.sectionHeader}>
                        <span>Active</span>
                        <span className={css.count}>{activeLinks.length}</span>
                    </div>
                    <div className={css.list}>
                        {activeLinks.map(entry => linkRow(entry, null,
                            entry.walletIsParent ?
                                <button onClick={() => clickRevoke(entry)}>Revoke</button> :
                                <span className={css.status}>Linked</span>))}
                        {!activeLinks.length && <div className={css.empty}>
                            {loading ? "Loading…" : "No active links"}</div>}
                    </div>
                </div>
                <div className={css.section}>
                    <div className={css.sectionHeader}>
                        <span>Pending</span>
                        <span className={css.count}>{pendingLinks.length}</span>
                    </div>
                    <div className={css.list}>
                        {pendingLinks.map(entry => {
                            if (entry.walletIsParent) {
                                // Incoming request naming a wallet address as parent.
                                const badge = <span className={`${css.badge} ${entry.revoked ?
                                    css.badgeRevoked : css.badgeIncoming}`}>
                                    {entry.revoked ? "Link revoked" : "Wants to link with you"}</span>
                                return linkRow(entry, badge,
                                    <button onClick={() => clickAccept(entry)}>
                                        {entry.revoked ? "Re-accept" : "Accept"}</button>)
                            }
                            if (entry.indirect) {
                                const badge = <span className={`${css.badge} ${css.badgeOutgoing}`}>
                                    Chained identity request</span>
                                return linkRow(entry, badge,
                                    <span className={css.status}>Awaiting approval</span>)
                            }
                            // Outgoing request from a wallet address.
                            const badge = <span className={`${css.badge} ${css.badgeOutgoing}`}>
                                Requested by you</span>
                            return linkRow(entry, badge,
                                <span className={css.status}>Awaiting approval</span>)
                        })}
                        {!pendingLinks.length && <div className={css.empty}>
                            {loading ? "Loading…" : "No pending link requests"}</div>}
                    </div>
                </div>
                <div className={css.request}>
                    <div className={css.requestLabel}>Request a new link</div>
                    <div className={css.requestRow}>
                        <div className={css.requestFields}>
                            <input ref={addressInputRef} onKeyDown={handleKeyDown} type="text"
                                   placeholder={"Address to link with"}/>
                            <input ref={messageInputRef} onKeyDown={handleKeyDown} type="text"
                                   placeholder={"Message (optional)"}/>
                        </div>
                        <button onClick={clickRequest}>Request</button>
                    </div>
                </div>
                <div className={styles.buttons}>
                    <button onClick={onClose}>Close</button>
                </div>
            </div>
        </Modal>
    )
}

export default Links
