const {ipcMain, app, BrowserWindow, Notification} = require("electron");
const fs = require("fs");
const path = require("path");
const {Dir, Handlers, Listeners, Modals} = require("../../common/util");
const {CompareVersions, PickAsset, PickLatestRelease} = require("../../common/util/release");
const {IsWalletWindow, OpenExternalUrl} = require("../window");

// Releases are published to GitHub by .github/workflows/release.yml, so the
// releases API is the source of truth for what is available - the same list the
// download page on the website reads.
const ReleasesApiUrl = "https://api.github.com/repos/memocash/desktop/releases?per_page=10"
const ReleasesPageUrl = "https://github.com/memocash/desktop/releases"

// The machine this copy is running on, as the release rules want to see it.
// APPIMAGE is set in the environment of a running AppImage, which is the only
// way to tell an AppImage install from a .deb one.
const RuntimeTarget = () => ({
    platform: process.platform,
    arch: process.arch,
    appImage: !!process.env.APPIMAGE,
})

// Update preferences are app-global rather than per-wallet, so they live in a
// small JSON file next to network.json and theme.json.
const ReadPrefs = () => {
    try {
        const stored = JSON.parse(fs.readFileSync(Dir.UpdateConfigFile, "utf8"))
        return {checkAutomatically: stored.checkAutomatically !== false}
    } catch (e) {
        return {checkAutomatically: true}
    }
}

const WritePrefs = (prefs) => {
    try {
        fs.mkdirSync(path.dirname(Dir.UpdateConfigFile), {recursive: true})
        fs.writeFileSync(Dir.UpdateConfigFile, JSON.stringify(prefs))
    } catch (e) {
        // Non-fatal: the choice still applies for this session.
    }
}

const RequestTimeout = 15 * 1000

const FetchReleases = async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), RequestTimeout)
    try {
        const response = await fetch(ReleasesApiUrl, {
            signal: controller.signal,
            headers: {
                "Accept": "application/vnd.github+json",
                // GitHub rejects API requests that do not identify themselves.
                "User-Agent": "Memo-Desktop/" + app.getVersion(),
            },
        })
        if (!response.ok) {
            throw new Error("GitHub returned " + response.status)
        }
        return await response.json()
    } finally {
        clearTimeout(timeout)
    }
}

// Checks share a short-lived cache so opening the modal right after a background
// check (or clicking through several windows) does not spend the unauthenticated
// GitHub rate limit. Explicit checks from the menu pass force.
const CacheTime = 60 * 1000
let lastResult = null

const CheckForUpdates = async ({force = false} = {}) => {
    if (lastResult && !force && Date.now() - lastResult.checkedAt < CacheTime) {
        return lastResult
    }
    const currentVersion = app.getVersion()
    const result = {
        currentVersion,
        checkedAt: Date.now(),
        updateAvailable: false,
        releasesPageUrl: ReleasesPageUrl,
        error: null,
    }
    try {
        const latest = PickLatestRelease(await FetchReleases(), currentVersion)
        if (latest) {
            const latestVersion = String(latest.tag_name).replace(/^v/, "")
            result.latestVersion = latestVersion
            result.updateAvailable = CompareVersions(latestVersion, currentVersion) > 0
            result.releaseUrl = latest.html_url
            result.releaseNotes = latest.body || ""
            result.publishedAt = latest.published_at
            result.asset = PickAsset(latest, RuntimeTarget())
        }
    } catch (e) {
        result.error = e.name === "AbortError" ? "The update check timed out." : (e.message || "Update check failed.")
    }
    lastResult = result
    return result
}

// The modal viewer only exists in a window with a wallet loaded, so fall back to
// the release page in a browser when there is nowhere to show it.
const ShowUpdate = (result) => {
    const windows = BrowserWindow.getAllWindows().filter((win) => IsWalletWindow(win.webContents.id))
    const win = windows.find((win) => win.isFocused()) || windows[0]
    if (!win) {
        OpenExternalUrl(result.releaseUrl || ReleasesPageUrl)
        return
    }
    if (win.isMinimized()) {
        win.restore()
    }
    win.show()
    win.focus()
    win.webContents.send(Listeners.DisplayModal, Modals.Update)
}

// Background checks stay quiet unless there is something to report, and mention
// a given version at most once per run so a long-running app does not nag.
const notifiedVersions = new Set()

const NotifyUpdate = (result) => {
    if (!Notification.isSupported() || notifiedVersions.has(result.latestVersion)) {
        return
    }
    notifiedVersions.add(result.latestVersion)
    const notification = new Notification({
        title: "Memo " + result.latestVersion + " is available",
        body: "You are running " + result.currentVersion + ". Click to see what changed.",
    })
    notification.on("click", () => ShowUpdate(result))
    notification.show()
}

const StartupDelay = 10 * 1000
const CheckInterval = 6 * 60 * 60 * 1000

// Wait for the window to finish loading before the first check so the update
// request does not compete with the wallet's own startup traffic.
const ScheduleUpdateChecks = () => {
    const check = async () => {
        if (!ReadPrefs().checkAutomatically) {
            return
        }
        const result = await CheckForUpdates({force: true})
        if (result.updateAvailable) {
            NotifyUpdate(result)
        }
    }
    setTimeout(() => {
        check()
        setInterval(check, CheckInterval).unref()
    }, StartupDelay).unref()
}

const UpdateHandlers = () => {
    ipcMain.handle(Handlers.CheckForUpdates, async (e, force) => await CheckForUpdates({force: !!force}))
    ipcMain.handle(Handlers.GetUpdatePrefs, () => ReadPrefs())
    ipcMain.handle(Handlers.SetUpdatePrefs, (e, prefs) => {
        const updated = {checkAutomatically: !!(prefs && prefs.checkAutomatically)}
        WritePrefs(updated)
        return updated
    })
}

module.exports = {
    ScheduleUpdateChecks,
    UpdateHandlers,
}
