const {app, ipcMain: rawIpcMain} = require("electron")
const {IsSameOrigin} = require("../common/util")

// Dev loads the Next dev server; prod loads the static export served over the
// app:// protocol (see main/index.js). The rest of the URL is identical.
const AppUrl = app.isPackaged ? "app://-" : "http://localhost:8000"

// Every handler in main answers to whichever frame sent the message. The other
// layers - origin-locked navigation, denied window opens, sandboxed renderers -
// exist to make sure that frame can only ever be the app's own page, but none
// of the handlers checked. This is the layer that still holds if one of those
// regresses (per-window hardening has drifted before): registration runs
// through here, and a sender whose frame is not on the expected origin is
// refused before the handler sees the message.
//
// An invoke from a refused sender rejects; a fire-and-forget send is dropped.
// A missing senderFrame - a frame destroyed or navigated mid-flight - is
// refused too: there is no way to say where such a message came from.
const GuardedIpc = (allowed) => {
    const refuse = (channel, e) => {
        const from = e.senderFrame ? e.senderFrame.url : "a gone frame"
        console.log("ipc: refused " + channel + " from " + from)
    }
    const permitted = (e) => e.senderFrame && allowed(e.senderFrame.url)
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

const ipcMain = GuardedIpc((url) => IsSameOrigin(url, AppUrl + "/"))

module.exports = {
    AppUrl,
    GuardedIpc,
    ipcMain,
}
