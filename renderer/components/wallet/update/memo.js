const UpdateMemoHistory = async ({addresses, setLastUpdate}) => {
    const txQuery = `
    tx {
        hash
        seen
        raw
        inputs {
            index
            prev_hash
            prev_index
        }
        outputs {
            index
            amount
            lock {
                address
            }
        }
        blocks {
            hash
            timestamp
            height
        }
    }
    `
    const profileFields = `
    name {
        name
        tx_hash
    }
    profile {
        text
        tx_hash
    }
    pic {
        pic
        tx_hash
    }
    `
    const query = `
    query ($addresses: [String!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            ${profileFields}
            posts {
                tx_hash
                text
                ${txQuery}
            }
            following {
                tx_hash
                unfollow
                ${txQuery}
                follow_lock {
                    address
                    profile {
                        ${profileFields}
                    }
                }
            }
            followers {
                tx_hash
                unfollow
                ${txQuery}
                lock {
                    address
                    profile {
                        ${profileFields}
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
