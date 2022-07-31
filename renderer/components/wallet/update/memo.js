const UpdateMemoHistory = async ({addresses, setLastUpdate}) => {
    const query = `
    query ($addresses: [String!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
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
            posts {
                tx_hash
                text
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
            }
            following {
                tx_hash
                unfollow
                follow_lock {
                    address
                    profile {
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
                    }
                }
            }
            followers {
                tx_hash
                unfollow
                lock {
                    address
                    profile {
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
