const test = require("node:test")
const assert = require("node:assert")

// The menus are where the DevTools shortcut would come from - nothing else
// binds one - so what ships is decided by what these templates contain.
// Electron is stubbed the way wallet.test.js stubs it; the templates are
// captured on build and searched like a user reading the menus would.
let lastTemplate
const electronStub = {
    app: {isPackaged: true},
    Menu: {
        buildFromTemplate: (template) => {
            lastTemplate = template
            return {template}
        },
        setApplicationMenu: () => {},
    },
}
const electron = require.resolve("electron")
require.cache[electron] = {id: electron, filename: electron, loaded: true, exports: electronStub}
const {ShowMenu, SimpleMenu} = require("./index")

const win = {
    setMenu: () => {},
    setMenuBarVisibility: () => {},
    webContents: {send: () => {}, openDevTools: () => {}},
}

const labels = () => lastTemplate.flatMap(({submenu}) => submenu || [])
    .map(({label}) => label).filter(Boolean)

test("a packaged build's menus carry no DevTools entry; development's do", () => {
    electronStub.app.isPackaged = true
    SimpleMenu(win)
    assert.ok(!labels().includes("Developer Tools"), "SimpleMenu, packaged")
    ShowMenu(win, () => {}, {walletType: "seed"})
    assert.ok(!labels().includes("Developer Tools"), "ShowMenu, packaged")

    electronStub.app.isPackaged = false
    SimpleMenu(win)
    assert.ok(labels().includes("Developer Tools"), "SimpleMenu, development")
    ShowMenu(win, () => {}, {walletType: "seed"})
    assert.ok(labels().includes("Developer Tools"), "ShowMenu, development")
})
