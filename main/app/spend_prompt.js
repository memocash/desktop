const {BrowserWindow} = require("electron");
const path = require("path");
const {pathToFileURL} = require("url");
const {Handlers, Listeners} = require("../common/util");
const {GuardedIpc} = require("./ipc");
const {BackgroundColor} = require("./window");

// Where a spend is authorised. Main opens this window itself, from a file on
// disk with a preload of its own, so nothing the wallet page runs is on either
// side of it: the password is typed here and goes straight to main, and the
// destinations shown here are the ones main worked out from the decrypted
// wallet, not the ones the page said it was paying.
//
// It is modal to the window that asked, which is what stops the page from
// drawing over it or dismissing it - a confirmation the page could cover is
// worth nothing. Closing it any other way counts as cancelling.

const PromptPage = path.join(__dirname, "..", "assets", "spend_prompt.html")
const PromptPreload = path.join(__dirname, "..", "preload.spend.bundle.cjs")

// The reply a prompt window is waiting for, under the id of that window. One
// entry per open prompt: a spend is serialised long before it reaches here, and
// each step is asked and answered before the next is sent.
const waiting = new Map()

const settle = (winId, message) => {
    const resolve = waiting.get(winId)
    if (resolve) {
        waiting.delete(winId)
        resolve(message)
    }
}

const OpenSpendPrompt = async (parent) => {
    const win = new BrowserWindow({
        width: 460,
        height: 360,
        parent,
        modal: true,
        show: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        title: "Confirm send",
        backgroundColor: BackgroundColor(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: PromptPreload,
        },
    })
    const id = win.webContents.id
    // A closed window is a refusal, however it was closed. Whatever is waiting
    // on an answer gets one rather than hanging on a window that has gone.
    const cancelOnClose = () => settle(id, {cancelled: true})
    win.once("closed", cancelOnClose)

    const ask = (step) => new Promise((resolve) => {
        waiting.set(id, resolve)
        if (step) {
            win.webContents.send(Listeners.SpendPromptStep, step)
        }
    })
    // Nothing is shown until the preload says the page is ready to be driven, so
    // no half-drawn window appears in front of anyone.
    const ready = ask()
    await win.loadFile(PromptPage)
    await ready
    win.show()

    return {
        // Shows where the transaction pays, as far as main can tell before it
        // has a password, and asks for one. Resolves with the password, or
        // undefined if the window was cancelled or closed. Asked again with
        // `wrong` after one that did not open the wallet.
        askPassword: async ({payments, fee, wrong = false}) => {
            const {password, cancelled} = await ask({name: "password", payments, fee, wrong})
            return cancelled ? undefined : password
        },
        // Only reached when the keys disagree with what was shown: the payments
        // they establish, for a yes or a no, with nothing signed either way.
        confirm: async ({payments, fee}) => {
            const {confirmed} = await ask({name: "confirm", payments, fee})
            return confirmed === true
        },
        // A send from a wallet with no password: the same window and the same
        // main-derived destinations, with nothing to type - the answer is the
        // person seeing where it pays and saying send.
        approve: async ({payments, fee}) => {
            const {confirmed} = await ask({name: "approve", payments, fee})
            return confirmed === true
        },
        close: () => {
            win.off("closed", cancelOnClose)
            waiting.delete(id)
            if (!win.isDestroyed()) {
                win.destroy()
            }
        },
    }
}

const SpendPromptHandlers = () => {
    // Answers come from the prompt's own preload and are matched to the window
    // they came from, so nothing can answer for a prompt it was not asked. The
    // prompt page is not on the app origin - it is a file main loads itself -
    // so this channel accepts exactly that file and nothing else: not the app
    // pages, and not any other file: frame.
    const promptIpc = GuardedIpc((url) => url === pathToFileURL(PromptPage).href)
    promptIpc.on(Handlers.SpendPromptReply, (e, message) => settle(e.sender.id, message))
}

module.exports = {
    OpenSpendPrompt,
    SpendPromptHandlers,
}
