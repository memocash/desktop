const {ipcMain, nativeTheme} = require("electron");
const fs = require("fs");
const {Dir, Handlers} = require("../../common/util");

// Appearance is app-global (unlike per-wallet settings), so it lives in a small
// JSON file next to network.json. themeSource drives Chromium's
// prefers-color-scheme in every window, which is what the renderer's CSS reads.
const ValidThemes = ["system", "light", "dark"]

const ReadTheme = () => {
    try {
        const theme = JSON.parse(fs.readFileSync(Dir.ThemeConfigFile, "utf8")).theme
        return ValidThemes.includes(theme) ? theme : "system"
    } catch (e) {
        return "system"
    }
}

const WriteTheme = (theme) => {
    try {
        fs.writeFileSync(Dir.ThemeConfigFile, JSON.stringify({theme}))
    } catch (e) {
        // Non-fatal: the choice still applies for this session.
    }
}

// Apply the stored preference at startup, before any window is created, so the
// first paint already matches (see backgroundColor in window.js).
const ApplyStoredTheme = () => {
    nativeTheme.themeSource = ReadTheme()
}

const ThemeHandlers = () => {
    ipcMain.handle(Handlers.GetTheme, () => nativeTheme.themeSource)
    ipcMain.handle(Handlers.SetTheme, (e, theme) => {
        if (!ValidThemes.includes(theme)) {
            return nativeTheme.themeSource
        }
        nativeTheme.themeSource = theme
        WriteTheme(theme)
        return nativeTheme.themeSource
    })
}

module.exports = {
    ThemeHandlers,
    ApplyStoredTheme,
}
