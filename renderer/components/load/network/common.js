const NetworkOptions = [
    {
        Name: "BCH",
        Ruleset: "bch",
        DatabaseFile: "~/.memo/memo.db",
        Server: "https://graph.cash",
        Id: "bch",
    },
    {
        Name: "BSV",
        Ruleset: "bsv",
        DatabaseFile: "~/.memo/memo-sv.db",
        Server: "http://127.0.0.1:26772",
        Id: "bsv",
    },
    {
        Name: "Dev",
        Ruleset: "bch",
        DatabaseFile: "~/.memo/memo-dev.db",
        Server: "http://127.0.0.1:26770",
        Id: "dev",
    },
]

const GetNetworkConfig = async () => {
    let networkConfig = await window.electron.getNetworkConfig()
    if (!networkConfig || !networkConfig.Networks || !networkConfig.Networks.length) {
        return {Networks: NetworkOptions}
    }
    return networkConfig
}

const GetNetworkOptions = async () => {
    return (await GetNetworkConfig()).Networks
}

// TODO: Allow wallet name as input to return default network for wallet
const GetDefaultNetwork = async () => {
    let networkConfig = await window.electron.getNetworkConfig()
    if (!networkConfig || !networkConfig.Networks || !networkConfig.Networks.length) {
        return NetworkOptions[0]
    }
    if (!networkConfig.Last) {
        return networkConfig.Networks[0]
    }
    return networkConfig.Networks[networkConfig.Last]
}

const SaveNetworkConfig = async (networkConfig) => {
    await window.electron.saveNetworkConfig(networkConfig)
}

const GetWindowNetwork = async () => {
    return await window.electron.getWindowNetwork()
}

const SetWindowNetwork = async (network) => {
    await window.electron.setWindowNetwork(network)
}

module.exports = {
    GetDefaultNetwork,
    GetNetworkConfig,
    GetNetworkOptions,
    GetWindowNetwork,
    SaveNetworkConfig,
    SetWindowNetwork,
}
