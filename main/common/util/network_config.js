const {SafeExternalUrl} = require("./urls")

const NetworkKeys = ["DatabaseFile", "Id", "Name", "Ruleset", "Server"]
const ConfigKeys = ["Last", "Networks"]
const Rulesets = new Set(["bch", "bsv"])
const MemoDatabase = /^~\/\.memo\/[^/\\]+\.db$/

// The hosts plaintext may speak to: traffic to these never leaves the
// machine, so there is no wire for it to be read from. URL lowercases the
// hostname and keeps an IPv6 literal in its brackets.
const IsLoopbackHost = (hostname) =>
    hostname === "localhost" || hostname === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)

const exactKeys = (value, allowed) => {
    const keys = Object.keys(value).sort()
    return keys.every((key) => allowed.includes(key)) && allowed.every((key) => keys.includes(key))
}

const ValidateNetworkOption = (option) => {
    if (!option || typeof option !== "object" || Array.isArray(option) ||
        !exactKeys(option, NetworkKeys)) {
        throw new TypeError("Invalid network option")
    }
    for (const key of NetworkKeys) {
        if (typeof option[key] !== "string" || !option[key].length) {
            throw new TypeError("Invalid network " + key)
        }
    }
    if (!Rulesets.has(option.Ruleset)) {
        throw new TypeError("Invalid network ruleset")
    }
    if (!MemoDatabase.test(option.DatabaseFile)) {
        throw new TypeError("Database file must be a .db file directly under ~/.memo")
    }
    const server = SafeExternalUrl(option.Server)
    if (!server) {
        throw new TypeError("Invalid network server")
    }
    const parsed = new URL(server)
    if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) {
        throw new TypeError("Network server must not contain credentials, a path, query, or fragment")
    }
    // Everything the app knows about a wallet - its addresses, its history,
    // its subscriptions - travels to this server, and the websocket side
    // follows the same scheme. Plaintext is fine on the loopback presets,
    // where it never touches a wire; a server anywhere else gets https or is
    // refused here, before anything is saved or connected to.
    if (parsed.protocol === "http:" && !IsLoopbackHost(parsed.hostname)) {
        throw new TypeError("A network server outside this machine must use https")
    }
    return {...option, Server: server.replace(/\/$/, "")}
}

const ValidateNetworkConfig = (config) => {
    if (!config || typeof config !== "object" || Array.isArray(config) ||
        !Object.keys(config).every((key) => ConfigKeys.includes(key)) ||
        !Array.isArray(config.Networks) || !config.Networks.length) {
        throw new TypeError("Invalid network configuration")
    }
    const networks = config.Networks.map(ValidateNetworkOption)
    const ids = new Set(networks.map(({Id}) => Id))
    if (ids.size !== networks.length) {
        throw new TypeError("Network ids must be unique")
    }
    if (config.Last !== undefined &&
        (!Number.isSafeInteger(config.Last) || config.Last < 0 || config.Last >= networks.length)) {
        throw new TypeError("Invalid last network index")
    }
    return config.Last === undefined ? {Networks: networks} : {Networks: networks, Last: config.Last}
}

// The networks the app ships with, and what a fresh install runs on until
// network.json says otherwise. They live here, on main's side, because they
// are also the servers a change may name without anyone being asked.
const DefaultNetworks = [
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
        Name: "Local",
        Ruleset: "bch",
        DatabaseFile: "~/.memo/memo-local.db",
        Server: "http://127.0.0.1:26770",
        Id: "local",
    },
]

// Where the databases sit under ~/.memo. The network chooses the file name;
// the build chooses the directory: the root for a packaged build, "dev" for
// one run from a checkout, so development never writes the installed app's
// files. MEMO_DATA names a directory of its own for a run that should touch
// neither - a smoke test, a resync trial. It is one name, never a path, so
// every database stays under ~/.memo. A database is a cache of the index
// server: an empty directory fills itself on the next sync.
const DataDirectory = (packaged, requested) => {
    if (requested === undefined || requested === "") {
        return packaged ? "" : "dev"
    }
    if (!/^[^/\\]+$/.test(requested) || requested === "." || requested === "..") {
        throw new TypeError("MEMO_DATA must be a single directory name")
    }
    return requested
}

// The option as the running build opens it: the stored file, moved into the
// build's directory. Every network alike, and never written back to
// network.json, so the stored path stays the one a packaged build opens.
const InDataDirectory = (option, directory) => !directory ? option :
    {...option, DatabaseFile: option.DatabaseFile.replace(/^~\/\.memo\//, "~/.memo/" + directory + "/")}

// The servers in a proposed list that nobody has vouched for yet: not shipped
// as a preset, not on this machine, and not on the list of servers a person
// allowed in main's dialog. Everything the wallet trusts about a token, and
// every transaction it stores, comes from whichever server it is pointed at,
// so these are the ones that go in front of a person. A server merely present
// in the stored file is not trusted by that: files written before main owned
// them were written by the page, with nobody asked. Each is named once, in
// the order the list gives them.
const UntrustedServers = (networks, approved) => {
    const trusted = new Set([...DefaultNetworks.map(({Server}) => Server), ...(approved || [])])
    const untrusted = []
    for (const {Server} of networks) {
        if (!trusted.has(Server) && !IsLoopbackHost(new URL(Server).hostname) &&
            !untrusted.includes(Server)) {
            untrusted.push(Server)
        }
    }
    return untrusted
}

module.exports = {
    DataDirectory,
    DefaultNetworks,
    InDataDirectory,
    IsLoopbackHost,
    UntrustedServers,
    ValidateNetworkConfig,
    ValidateNetworkOption,
}
