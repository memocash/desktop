import {ProfileFields, TxTimeQuery} from "../../util/graphql";

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
                ${TxTimeQuery}
                accepts {
                    tx_hash
                    request_tx_hash
                    message
                    ${TxTimeQuery}
                    revokes {
                        tx_hash
                        accept_tx_hash
                        message
                        ${TxTimeQuery}
                    }
                }
            }
        }
    }
    `

// Syncs link requests/accepts/revokes for the whole historical linked-address cluster of
// a set of addresses (a viewed profile, or all of a wallet's addresses) and
// returns the cluster. A profile's links cover both directions - requests the
// address signed and requests naming it as parent, each with its accepts and
// revokes nested - but not the links of the addresses on the far end of those,
// so a cluster more than one hop deep can't be resolved in one pass: alternate
// fetch-and-save with local GetLinkedAddresses until it stops growing. Every
// fetched profile's link data is saved locally, so the cluster still resolves
// from the local db when offline. Revoked edges remain in this cluster because
// their pre-revoke records remain part of the identity; readers enforce the
// revoke timestamp as a cutoff.
const SyncProfileLinks = async ({addresses}) => {
    if (!addresses || !addresses.length) {
        return []
    }
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

// Syncs both the historical link graph and the profile fields reachable
// through it. Feed and chat payloads only embed the posting address's profile,
// so this supplies fields inherited from an older, revoked child address.
const SyncLinkedProfiles = async ({addresses}) => {
    const linked = await SyncProfileLinks({addresses})
    if (!linked.length) {
        return linked
    }
    const data = await window.electron.graphQL(`
        query ($addresses: [Address!]) {
            profiles(addresses: $addresses) {
                lock {
                    address
                }
                ${ProfileFields}
            }
        }
    `, {addresses: linked})
    const profiles = data.data.profiles || []
    await window.electron.saveMemoProfiles(profiles)
    await window.electron.saveMemoProfileImages(profiles)
    return linked
}

export {SyncLinkedProfiles}
export default SyncProfileLinks
