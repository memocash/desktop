const {SafeExternalUrl} = require("./urls")

const NetworkKeys = ["DatabaseFile", "Id", "Name", "Ruleset", "Server"]
const ConfigKeys = ["Last", "Networks"]
const Rulesets = new Set(["bch", "bsv"])
const MemoDatabase = /^~\/\.memo\/[^/\\]+\.db$/

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

module.exports = {ValidateNetworkConfig, ValidateNetworkOption}
