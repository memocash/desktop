const {app, ipcMain: rawIpcMain} = require("electron")
const {IsSameOrigin} = require("../common/util")
const {IsLoadWindow} = require("./window_state")

// Dev loads the local dev server; prod loads the static export served over the
// app:// protocol (see main/index.js). The rest of the URL is identical. The
// load page is on neither: main loads it from disk (see main/app/window.js).
const AppUrl = app.isPackaged ? "app://-" : "http://localhost:8000"

// Every handler in main answers to whichever frame sent the message. The other
// layers - origin-locked navigation, denied window opens, sandboxed renderers -
// exist to make sure that frame can only ever be the app's own page, but none
// of the handlers checked. This is the layer that still holds if one of those
// regresses (per-window hardening has drifted before): registration runs
// through here, and a sender the surface's rule does not admit is refused
// before the handler sees the message.
//
// Only a window's main frame is ever admitted, whatever the rule says: a
// subframe shows a document the page put there, and a rule that looked at the
// frame's url alone would take a framed copy of a legitimate page for the page
// itself. Nothing in the app frames anything, so there is no sender to lose.
//
// An invoke from a refused sender rejects; a fire-and-forget send is dropped.
// A missing senderFrame - a frame destroyed or navigated mid-flight - is
// refused too: there is no way to say where such a message came from.
const GuardedIpc = (allowed) => {
    const refuse = (channel, e) => {
        const from = e.senderFrame ? e.senderFrame.url : "a gone frame"
        console.log("ipc: refused " + channel + " from " + from)
    }
    const permitted = (e) => e.senderFrame && e.sender && e.senderFrame === e.sender.mainFrame && allowed(e)
    return {
        handle: (channel, fn) => rawIpcMain.handle(channel, (e, ...args) => {
            if (!permitted(e)) {
                refuse(channel, e)
                throw new Error("refused sender on " + channel)
            }
            return fn(e, ...args)
        }),
        on: (channel, fn) => rawIpcMain.on(channel, (e, ...args) => {
            if (!permitted(e)) {
                refuse(channel, e)
                return
            }
            fn(e, ...args)
        }),
    }
}

// The three surfaces, by who may call. A channel registers under exactly one,
// so where it belongs is decided where it is registered and nowhere else.
//
// - ipcMain: the wallet and transaction pages, on the app origin. Everything
//   a loaded wallet does.
// - loadIpc: the windows main opened on the load page, judged by the sending
//   WebContents rather than by url (see IsLoadWindow) - with the one thing a
//   url can still say checked too, that the document is a local file, since
//   main loads nothing else into such a window. Unlocking, creating, the seed
//   steps, and the network choice register here and only here, so no page
//   holding a wallet can reach a channel that takes a password.
// - sharedIpc: what both kinds of page need - a dialog, the clipboard, the
//   window's own id.
const fromAppPage = (e) => IsSameOrigin(e.senderFrame.url, AppUrl + "/")
const fromLoadWindow = (e) => IsLoadWindow(e.sender.id) && e.senderFrame.url.startsWith("file:")
const ipcMain = GuardedIpc(fromAppPage)
const loadIpc = GuardedIpc(fromLoadWindow)
const sharedIpc = GuardedIpc((e) => fromAppPage(e) || fromLoadWindow(e))

module.exports = {
    AppUrl,
    GuardedIpc,
    ipcMain,
    loadIpc,
    sharedIpc,
}
