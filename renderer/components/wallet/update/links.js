// Resolves the historical linked-address cluster of a set of addresses (a
// viewed profile, or all of a wallet's addresses), syncing its link requests,
// accepts and revokes in main on the way (main/sync/memo.js), and returns the
// cluster.
const SyncProfileLinks = async ({addresses}) => {
    if (!addresses || !addresses.length) {
        return []
    }
    return await window.electron.syncProfileLinks({addresses})
}

// The link graph and the profile fields reachable through it. Feed and chat
// payloads only embed the posting address's profile, so this supplies fields
// inherited from an older, revoked child address.
const SyncLinkedProfiles = async ({addresses}) => await window.electron.syncLinkedProfiles({addresses})

export {SyncLinkedProfiles}
export default SyncProfileLinks
