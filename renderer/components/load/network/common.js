const NetworkOptions = [
    {
        Name: "BCH",
        Ruleset: "bch",
        DatabaseFile: "~/.memo/memo.db",
        Server: "http://127.0.0.1:26771",
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

const GetNetworkOptions = async () => {
    let networkConfig = await window.electron.getNetworkConfig()
    if (!networkConfig || !networkConfig.Networks || !networkConfig.Networks.length) {
        return NetworkOptions
    }
    return networkConfig.Networks
}

export {
    GetNetworkOptions,
}
