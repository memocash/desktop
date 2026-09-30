const {ipcRenderer} = require("electron");
const {Handlers} = require("../common/util/handlers");

// A rejection from a handler arrives prefixed with the channel it came over
// ("Error invoking remote method 'x': Error: ..."). Callers that show the
// reason to the person get the reason alone.
const unwrapped = async (invoked) => {
    try {
        return await invoked
    } catch (error) {
        throw new Error(String(error.message)
            .replace(/^Error invoking remote method '[^']*': (?:[A-Za-z]*Error: )?/, ""))
    }
}

// The network configuration, as the load page reads, edits, and chooses from
// it. Main answers every call with the configuration it holds and gates every
// change; the page names an entry by id and never hands main a server of its
// own. A wallet window is set onto its network before its page loads and only
// ever asks which (getWindowNetwork, in wallet.js).
module.exports = {
    getNetworkConfig: async () => ipcRenderer.invoke(Handlers.GetNetworkConfig),
    // The page shows what these refuse for - next to the field, or in a
    // dialog of its own - so the message crosses without the channel name
    // Electron prefixes to a handler's rejection.
    saveNetworkConfig: async (networkConfig) =>
        unwrapped(ipcRenderer.invoke(Handlers.SaveNetworkConfig, networkConfig)),
    selectNetwork: async (id) => unwrapped(ipcRenderer.invoke(Handlers.SelectNetwork, id)),
}
