import {LikesQuery, PostFields, ProfileFields, TxQuery} from "../../util/graphql";

const UpdateMemoHistory = async ({addresses, setLastUpdate}) => {
    const query = `
    query ($addresses: [String!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            ${ProfileFields}
            posts {
                tx_hash
                text
                ${TxQuery}
                ${LikesQuery}
                parent {
                    ${PostFields}
                }
                replies {
                    ${PostFields}
                }
            }
            following {
                tx_hash
                unfollow
                ${TxQuery}
                follow_lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
            }
            followers {
                tx_hash
                unfollow
                ${TxQuery}
                lock {
                    address
                    profile {
                        ${ProfileFields}
                    }
                }
            }
        }
    }
    `
    let data = await window.electron.graphQL(query, {
        addresses: addresses,
    })
    await window.electron.saveMemoProfiles(data.data.profiles)
    setLastUpdate((new Date()).toISOString())
}

export default UpdateMemoHistory
