const UpdateMemoHistory = async ({wallet, setLastUpdate}) => {
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
            following {
                follow_lock {
                    address
                }
            }
            followers {
                lock {
                    address
                }
            }
        }
    }
    `
    let data = await window.electron.graphQL(query, {
        addresses: wallet.addresses,
    })
    await window.electron.saveMemoProfiles(data.data.profiles)
    setLastUpdate((new Date()).toISOString())
}

export default UpdateMemoHistory
