const UpdateMemoHistory = async ({wallet, setLastUpdate}) => {
    const query = `
    query ($addresses: [String!]) {
        profiles(addresses: $addresses) {
            lock {
                address
            }
            name
            profile
            image
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
