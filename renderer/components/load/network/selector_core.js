// The network selector's computable parts, in commonjs so node's test runner
// can require them directly - configuration.js and pages/index.js are jsx
// that only the bundler loads. Each of these carries a decision that once
// lived inline in an event handler, where reverting it could only be noticed
// by clicking through the app.
const {IsLoopbackHost} = require("../../../../main/common/util/network_config")

// The configured network a wallet is about to open on, found by the id the
// load screen's dropdown holds. Refusing an unmatched id is the point: the
// caller's fallthrough used to open the wallet with no network set at all.
const SelectedNetwork = (networkConfig, selectedId) => {
    const index = networkConfig.Networks.findIndex((option) => option.Id === selectedId)
    if (index === -1) {
        throw new Error("no configured network matches the selection")
    }
    return {index, option: networkConfig.Networks[index]}
}

// What a change of the editor's list selection does: switch to the named
// network, unless unsaved changes make it ask first - and a declined ask
// keeps the current network, telling the caller to put the highlight back.
// A clean form never asks.
const NextSelection = ({options, currentId, nextId, hasChanged, confirmDiscard}) => {
    if (hasChanged && !confirmDiscard()) {
        return {revertTo: currentId}
    }
    return {network: options.find((option) => option.Id === nextId)}
}

// The editor's save, as one settled step: read the config, place the form's
// values over the network being edited, and offer the result to the saver.
// A refused save rejects out of here before anything is returned, so the
// caller's state updates - which follow the return - never see it.
const SubmitNetworkForm = async ({getConfig, save, networkId, values}) => {
    const read = await getConfig()
    let updatedNetwork
    const networks = read.Networks.map((item) => {
        if (item.Id !== networkId) {
            return item
        }
        updatedNetwork = {...item, ...values, Server: values.Server.replace(/[\/?]$/, "")}
        return updatedNetwork
    })
    const networkConfig = {...read, Networks: networks}
    await save(networkConfig)
    return {networkConfig, updatedNetwork}
}

// The same rules main's ValidateNetworkOption enforces, asked while typing so
// the answer arrives as feedback next to the field instead of as a refused
// save. Empty string means the server passes.
const ServerError = (server) => {
    if (!/^(http|https):\/\//.test(server)) {
        return "Server must have http/s"
    }
    let url;
    try {
        url = new URL(server)
    } catch (_) {
        return "Unable to parse server"
    }
    if (url.pathname.length > 0 && url.pathname !== "/") {
        return "Server path not allowed"
    } else if (url.search.length > 0) {
        return "Server search not allowed"
    } else if (url.hash.length > 0) {
        return "Server fragment not allowed"
    } else if (url.username.length > 0 || url.password.length > 0) {
        return "Server credentials not allowed"
    } else if (url.protocol === "http:" && !IsLoopbackHost(url.hostname)) {
        return "A server outside this machine must use https"
    }
    return ""
}

module.exports = {NextSelection, SelectedNetwork, ServerError, SubmitNetworkForm}
