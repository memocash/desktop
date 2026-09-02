// Main answers every one of these with a configuration: the shipped presets
// until network.json says otherwise. Which networks exist, which servers they
// use, and which one a window runs on are main's to hold - the page names an
// entry by id and edits the list through a save main gates.
const GetNetworkConfig = async () => {
    return await window.electron.getNetworkConfig()
}

const GetNetworkOptions = async () => {
    return (await GetNetworkConfig()).Networks
}

// TODO: Allow wallet name as input to return default network for wallet
const GetDefaultNetwork = async () => {
    const networkConfig = await GetNetworkConfig()
    if (!networkConfig.Last) {
        return networkConfig.Networks[0]
    }
    return networkConfig.Networks[networkConfig.Last]
}

const SaveNetworkConfig = async (networkConfig) => {
    await window.electron.saveNetworkConfig(networkConfig)
}

const SelectNetwork = async (id) => {
    await window.electron.selectNetwork(id)
}

module.exports = {
    GetDefaultNetwork,
    GetNetworkConfig,
    GetNetworkOptions,
    SaveNetworkConfig,
    SelectNetwork,
}
