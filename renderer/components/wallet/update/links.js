import bitcoin from "../../util/bitcoin";

const LinksQuery = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            link_requests {
                tx_hash
                address
                parent_address
                message
            }
            link_accepts {
                tx_hash
                address
                request_tx_hash
                message
            }
            link_revokes {
                tx_hash
                address
                accept_tx_hash
                message
            }
        }
    }
    `

// A parent's link_accepts only carry the request tx hash - the child address
// lives on the request itself, which is only returned on the child's own
// profile. The request tx's input tells us who sent it (the child), so fetch
// the tx and read the input's previous output lock. Uses aliased single-tx
// queries because the plural txs(hashes:) endpoint currently errors
// server-side. Hashes come from the server as hex, safe to inline.
const requestSendersQuery = (txHashes) => "query { " + txHashes.map((hash, i) =>
    `t${i}: tx(hash: "${hash}") { hash inputs { output { lock { address } } } } `).join("") + "}"

// Syncs link requests/accepts/revokes for the whole linked-address cluster of
// a set of addresses (a viewed profile, or all of a wallet's addresses) and
// returns the cluster. Membership can't be resolved in one pass:
// starting from a child, only its request is visible until the parent's
// profile (holding the accept and any revoke) is fetched; starting from a
// parent, the children aren't known until their request txs are resolved. So
// alternate fetch-and-save with local GetLinkedAddresses until the cluster
// stops growing. Every fetched profile's link data is saved locally, so the
// active-link rules (accept matches request's parent, no revoke from either
// side) live in one place - the GetLinkedAddresses SQL - and the cluster still
// resolves from the local db when offline.
const SyncProfileLinks = async ({addresses}) => {
    const synced = new Set()
    let frontier = [...new Set(addresses)]
    for (let i = 0; i < 5 && frontier.length; i++) {
        const data = await window.electron.graphQL(LinksQuery, {addresses: frontier})
        frontier.forEach(frontierAddress => synced.add(frontierAddress))
        const profiles = data.data.profiles || []
        await window.electron.saveMemoProfiles(profiles)
        const candidates = new Set()
        const requestTxHashes = new Set()
        for (const profile of profiles) {
            for (const request of profile.link_requests || []) {
                requestTxHashes.add(request.tx_hash)
                candidates.add(request.address)
                candidates.add(request.parent_address)
            }
        }
        // Revoked accepts' requests are resolved too - the link is inactive,
        // but without the request row a parent-side revoked link would be
        // invisible locally (nothing to list in the Links modal, no re-accept).
        const unknownRequests = new Set()
        for (const profile of profiles) {
            for (const accept of profile.link_accepts || []) {
                if (!requestTxHashes.has(accept.request_tx_hash)) {
                    unknownRequests.add(accept.request_tx_hash)
                }
            }
        }
        if (unknownRequests.size) {
            const txData = await window.electron.graphQL(requestSendersQuery([...unknownRequests]), {})
            for (const tx of Object.values(txData.data)) {
                if (!tx || !tx.inputs) {
                    continue
                }
                for (const input of tx.inputs) {
                    if (input.output && input.output.lock && input.output.lock.address) {
                        candidates.add(input.output.lock.address)
                    }
                }
            }
        }
        const linked = await window.electron.getLinkedAddresses(addresses)
        frontier = [...new Set([...linked, ...candidates])].filter(
            candidate => !synced.has(candidate))
    }
    return await window.electron.getLinkedAddresses(addresses)
}

// Discovers incoming link requests that name one of the wallet's addresses as
// parent. The server never returns link_requests on the parent's profile -
// they only appear on the child's - so without this a request from an unknown
// address would stay invisible until its profile happened to be viewed.
// Request txs typically pay the parent, which lands them in the wallet's
// synced tx history; scan those for request scripts naming a wallet pkhash,
// resolve each sender via the server, and save the senders' link data so the
// requests show up as pending.
const DiscoverLinkRequests = async ({addresses}) => {
    const potentials = await window.electron.getPotentialLinkRequests()
    if (!potentials || !potentials.length) {
        return
    }
    const walletPkHashes = {}
    for (const address of addresses) {
        walletPkHashes[Buffer.from(bitcoin.GetPkHashFromAddress(address)).toString("hex")] = true
    }
    const requestTxHashes = potentials.filter(potential => walletPkHashes[potential.parent_pkhash])
        .map(potential => potential.tx_hash)
    if (!requestTxHashes.length) {
        return
    }
    const txData = await window.electron.graphQL(requestSendersQuery(requestTxHashes), {})
    const senders = new Set()
    for (const tx of Object.values(txData.data)) {
        if (!tx || !tx.inputs) {
            continue
        }
        for (const input of tx.inputs) {
            if (input.output && input.output.lock && input.output.lock.address) {
                senders.add(input.output.lock.address)
            }
        }
    }
    if (!senders.size) {
        return
    }
    const data = await window.electron.graphQL(LinksQuery, {addresses: [...senders]})
    await window.electron.saveMemoProfiles(data.data.profiles || [])
}

export {
    DiscoverLinkRequests,
}

export default SyncProfileLinks
