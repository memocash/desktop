const {ipcMain} = require("../ipc");
const {dialog} = require("electron");
const fs = require("fs/promises");
const {Dir, Handlers} = require("../../common/util");
const {
    DefaultNetworks, UntrustedServers, ValidateNetworkConfig,
} = require("../../common/util/network_config");
const {GetRuntimeNetworkOption} = require("../window");
const {GetWindow, GetNetworkOption, SetNetworkOption} = require("../window_state");

// Two files: the configuration the page sees, in the shape every version of
// the app validates, and beside it main's own record of the servers a person
// allowed in the dialog. Approval is never taken from a request and never
// handed to the page. It is kept out of network.json on purpose - an older
// release reads that file with an exact list of keys, and a key it did not
// know would have it discard the person's networks for the presets. A
// configuration that does not validate, or is missing, reads as the shipped
// presets; an approval record that is missing or malformed reads as none,
// so a file written by a page in an older version, with nobody asked,
// vouches for nothing: its custom servers are asked about on first use.
//
// An approval holds only while its server is on the list, and that is
// judged here, on every read, against the configuration as it stands - not
// trusted to the record. The two files are written one after the other, and
// the record can be left behind: a write that fails after the configuration
// landed, or an older release rewriting the configuration alone, since it
// knows nothing of the record. Either way a server removed from the list
// is asked about again when it comes back, whatever the record still says.
const readJson = async (file) => JSON.parse(await fs.readFile(file, {encoding: "utf8"}))
const approvedIn = (record, config) => {
    const servers = new Set(config.Networks.map(({Server}) => Server))
    const kept = []
    for (const server of Array.isArray(record) ? record : []) {
        if (typeof server === "string" && servers.has(server) && !kept.includes(server)) {
            kept.push(server)
        }
    }
    return kept
}
const readStored = async () => {
    let config
    try {
        config = ValidateNetworkConfig(await readJson(Dir.NetworkConfigFile))
    } catch (e) {
        config = {Networks: DefaultNetworks}
    }
    let approved = []
    try {
        approved = approvedIn(await readJson(Dir.NetworkApprovedFile), config)
    } catch (e) {
    }
    return {config, approved}
}

// The record written is pruned to the list it is written beside, the same
// rule the read applies; the configuration goes first so that a write cut
// short leaves an approval unrecorded - asked once more - rather than a
// configuration unrecorded.
const writeStored = async (config, approved) => {
    await fs.writeFile(Dir.NetworkConfigFile, JSON.stringify(config, null, 2) + "\n")
    await fs.writeFile(Dir.NetworkApprovedFile, JSON.stringify(approvedIn(approved, config), null, 2) + "\n")
}

// Puts a person in front of every server the wallet would newly be pointed
// at. The server is the one source the wallet trusts for which outputs carry
// tokens - a server that lies can have a token output spent as plain coins
// and burned - and until now the page chose it alone. Asked in the same
// native dialog the wallet's key and export gates use: drawn by main, modal
// to the asking window, impossible for the page to cover or answer. The
// presets and anything on this machine pass without asking, as does a server
// approved here before. Declining throws, so nothing is written or set.
const confirmServers = async (winId, servers, ifNot) => {
    const {response} = await dialog.showMessageBox(GetWindow(winId), {
        type: "warning",
        buttons: ["Cancel", "Use server"],
        defaultId: 0,
        cancelId: 0,
        title: "Network server",
        message: servers.length === 1
            ? "Point this wallet at a new server?"
            : "Point this wallet at new servers?",
        detail: "Everything the wallet knows - its transactions, its balances, " +
            "and which coins carry tokens - comes from the server it uses. A " +
            "server that lies can make a token look like plain coins, and " +
            "spending it that way burns the tokens.\n\n" +
            servers.join("\n") + "\n\n" +
            "If you didn't just " + ifNot + ", cancel.",
    })
    if (response !== 1) {
        throw new Error("not allowed in the confirmation dialog")
    }
}

// The approvals are read once, before the dialog, and what is written is the
// request as validated plus exactly the servers the dialog named against that
// reading: the dialog waits on a person while the page keeps running. A save
// is the editor's whole list, so it replaces whatever another window wrote
// while the dialog was open - and reading the record again afterwards would
// change nothing, since any server the request holds that was approved
// meanwhile is one this dialog named too, and the record is pruned to the
// request either way. A request carrying an approval list of its own fails
// validation - no such key is part of the shape the page may send.
const saveNetworkConfig = async (winId, networkConfig) => {
    const validated = ValidateNetworkConfig(networkConfig)
    const {approved} = await readStored()
    const untrusted = UntrustedServers(validated.Networks, approved)
    if (untrusted.length) {
        await confirmServers(winId, untrusted, "edit the network configuration")
    }
    await writeStored(validated, [...approved, ...untrusted])
}

// A window runs on an entry of the stored configuration, named by id: the
// page chooses which, main supplies what that entry says. Nothing the page
// sends can put a server in front of a window that the file does not hold,
// and an entry whose server no person has approved - a preset aside - is
// asked about here before the window is set onto it. The choice is
// remembered as the default for the next load, the way the load screen
// always did.
//
// A selection changes only Last, but it writes the whole file, so what it
// writes has to be the file as it stands when the write happens - not as it
// stood before the dialog. The dialog waits on a person, and another load
// window (the menu opens as many as asked for) can save an edit meanwhile;
// writing back the earlier reading would quietly revert that edit and drop
// the approval it recorded. So after a dialog the files are read again and
// the selection is made against that reading. The dialog vouched for one
// server by name: an entry that is gone, or now points elsewhere, is not
// what the person answered for, and the selection is refused.
const selectNetwork = async (winId, id) => {
    let {config, approved} = await readStored()
    const find = (config) => config.Networks.findIndex((option) => option.Id === id)
    let index = find(config)
    if (typeof id !== "string" || index === -1) {
        throw new Error("no configured network matches the selection")
    }
    let option = config.Networks[index]
    const untrusted = UntrustedServers([option], approved)
    if (untrusted.length) {
        await confirmServers(winId, untrusted, "choose this network");
        ({config, approved} = await readStored())
        index = find(config)
        if (index === -1 || config.Networks[index].Server !== option.Server) {
            throw new Error("the network changed while the dialog was open")
        }
        option = config.Networks[index]
    }
    SetNetworkOption(winId, option)
    await writeStored({...config, Last: index}, [...approved, ...untrusted])
    return GetRuntimeNetworkOption(option)
}

const NetworkHandlers = () => {
    ipcMain.handle(Handlers.GetNetworkConfig, async () => (await readStored()).config)
    ipcMain.handle(Handlers.SaveNetworkConfig, async (e, networkConfig) =>
        saveNetworkConfig(e.sender.id, networkConfig))
    ipcMain.handle(Handlers.SelectNetwork, async (e, id) => selectNetwork(e.sender.id, id))
    ipcMain.handle(Handlers.GetWindowNetwork, async (e) =>
        GetRuntimeNetworkOption(GetNetworkOption(e.sender.id)))
}

module.exports = {
    NetworkHandlers: NetworkHandlers,
}
