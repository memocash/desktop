import bitcoin from "../../util/bitcoin";

const LinksQuery = `
    query ($addresses: [Address!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            links {
                tx_hash
                address
                parent_address
                message
                accepts {
                    tx_hash
                    request_tx_hash
                    message
                    revokes {
                        tx_hash
                        accept_tx_hash
                        message
                    }
                }
            }
        }
    }
    `

// Syncs link requests/accepts/revokes for the whole linked-address cluster of
// a set of addresses (a viewed profile, or all of a wallet's addresses) and
// returns the cluster. A profile's links only cover the requests that address
// signed - the parent's accept and any revoke come nested with them, but the
// parent's own upward links don't, and children never appear on the parent at
// all. So membership can't be resolved in one pass: alternate fetch-and-save
// with local GetLinkedAddresses until the cluster stops growing. Every fetched
// profile's link data is saved locally, so the cluster still resolves from the
// local db when offline.
const SyncProfileLinks = async ({addresses}) => {
    const synced = new Set()
    let frontier = [...new Set(addresses)]
    for (let i = 0; i < 5 && frontier.length; i++) {
        const data = await window.electron.graphQL(LinksQuery, {addresses: frontier})
        frontier.forEach(frontierAddress => synced.add(frontierAddress))
        const profiles = data.data.profiles || []
        await window.electron.saveMemoProfiles(profiles)
        const candidates = new Set()
        for (const profile of profiles) {
            for (const link of profile.links || []) {
                candidates.add(link.address)
                candidates.add(link.parent_address)
            }
        }
        const linked = await window.electron.getLinkedAddresses(addresses)
        frontier = [...new Set([...linked, ...candidates])].filter(
            candidate => !synced.has(candidate))
    }
    return await window.electron.getLinkedAddresses(addresses)
}

// A request names its parent but not its sender - the sender is only visible
// on the request tx itself, whose input spends one of the sender's outputs. So
// fetch the tx and read the input's previous output lock. Uses aliased
// single-tx queries because the plural txs(hashes:) endpoint currently errors
// server-side. Hashes are hex from the local db, safe to inline.
const requestSendersQuery = (txHashes) => "query { " + txHashes.map((hash, i) =>
    `t${i}: tx(hash: "${hash}") { hash inputs { output { lock { address } } } } `).join("") + "}"

// Discovers incoming link requests that name one of the wallet's addresses as
// parent. The server only returns a request on its sender's own profile, never
// on the parent's, so without this a request from an unknown address would stay
// invisible until its profile happened to be viewed.
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
