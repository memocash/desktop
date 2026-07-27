const test = require("node:test");
const assert = require("node:assert");
const {CompareVersions, IsPrerelease, MatchesArch, PickAsset, PickLatestRelease} = require("./release");

// The exact asset names published for v0.0.4-rc2. Note the architecture token
// differs per target: amd64 for deb, x86_64 for AppImage, x64 for mac and win.
const Assets = [
    "Memo-0.0.5-linux-amd64.deb",
    "Memo-0.0.5-linux-arm64.deb",
    "Memo-0.0.5-linux-arm64.AppImage",
    "Memo-0.0.5-linux-x86_64.AppImage",
    "Memo-0.0.5-mac-arm64.dmg",
    "Memo-0.0.5-mac-arm64.zip",
    "Memo-0.0.5-mac-x64.dmg",
    "Memo-0.0.5-mac-x64.zip",
    "Memo-0.0.5-win-x64.exe",
].map((name) => ({name, browser_download_url: "https://example.test/" + name, size: 1}))

const Release = {assets: Assets}
const pick = (target) => {
    const asset = PickAsset(Release, target)
    return asset ? asset.name : null
}

test("versions sort by numeric core", () => {
    assert.equal(CompareVersions("0.0.1", "0.0.2"), -1)
    assert.equal(CompareVersions("0.1.0", "0.0.4"), 1)
    assert.equal(CompareVersions("1.0.0", "0.1.0"), 1)
    assert.equal(CompareVersions("0.0.4", "0.0.4"), 0)
    assert.equal(CompareVersions("1.2", "1.1.9"), 1)
    assert.equal(CompareVersions("v0.0.5", "0.0.4"), 1)
})

test("a hyphenated suffix is a prerelease and sorts below the plain version", () => {
    assert.equal(CompareVersions("0.0.4-rc2", "0.0.4"), -1)
    assert.equal(CompareVersions("0.0.4-rc1", "0.0.4-rc2"), -1)
    assert.equal(CompareVersions("0.0.4-rc10", "0.0.4-rc2"), 1)
    assert.equal(CompareVersions("0.0.3", "0.0.4-rc1"), -1)
})

test("a bare letter suffix is a later patch and sorts above the plain version", () => {
    assert.equal(CompareVersions("0.0.2", "0.0.2b"), -1)
    assert.equal(CompareVersions("0.0.2b", "0.0.2c"), -1)
    assert.equal(CompareVersions("0.0.2c", "0.0.3"), -1)
})

test("only hyphenated suffixes count as prereleases", () => {
    assert.equal(IsPrerelease("0.0.4-rc2"), true)
    assert.equal(IsPrerelease("0.0.4"), false)
    assert.equal(IsPrerelease("0.0.2b"), false)
})

const Releases = [
    {tag_name: "v0.0.5-rc1", prerelease: true, id: "rc"},
    {tag_name: "v0.0.4", prerelease: false, id: "final"},
    {tag_name: "v0.0.6", draft: true, id: "draft"},
    {tag_name: "v0.0.3", prerelease: false, id: "old"},
]

test("a stable install is never offered a prerelease", () => {
    assert.equal(PickLatestRelease(Releases, "0.0.3").id, "final")
})

test("a prerelease install keeps seeing prereleases", () => {
    assert.equal(PickLatestRelease(Releases, "0.0.4-rc2").id, "rc")
})

test("an rc tag counts as a prerelease even when GitHub does not flag it", () => {
    // Releases here are cut with `gh release create` without --prerelease, so
    // the tag is the only signal that v0.0.4-rc2 is not a final release.
    const unflagged = [{tag_name: "v0.0.4-rc2", prerelease: false, id: "rc"}, {tag_name: "v0.0.3", id: "final"}]
    assert.equal(PickLatestRelease(unflagged, "0.0.3").id, "final")
    assert.equal(PickLatestRelease(unflagged, "0.0.4-rc1").id, "rc")
})

test("drafts are never offered", () => {
    assert.equal(PickLatestRelease([{tag_name: "v9.9.9", draft: true}], "0.0.3"), null)
    assert.equal(PickLatestRelease([], "0.0.3"), null)
    assert.equal(PickLatestRelease(null, "0.0.3"), null)
})

test("architecture is matched as a delimited token, not a substring", () => {
    assert.equal(MatchesArch("Memo-0.0.5-linux-arm64.deb", "arm64"), true)
    // "arm" is a substring of "arm64": a 32-bit machine must not match it.
    assert.equal(MatchesArch("Memo-0.0.5-linux-arm64.deb", "arm"), false)
    assert.equal(MatchesArch("Memo-0.0.5-win-x64.exe", "ia32"), false)
    assert.equal(MatchesArch("Memo-0.0.5-linux-amd64.deb", "x64"), true)
    assert.equal(MatchesArch("Memo-0.0.5-linux-x86_64.AppImage", "x64"), true)
    assert.equal(MatchesArch("Memo-0.0.5-linux-arm64.deb", "x64"), false)
    assert.equal(MatchesArch("Memo-0.0.5-mac-x64.dmg", "arm64"), false)
})

test("each platform and architecture gets its own installer", () => {
    assert.equal(pick({platform: "darwin", arch: "arm64"}), "Memo-0.0.5-mac-arm64.dmg")
    assert.equal(pick({platform: "darwin", arch: "x64"}), "Memo-0.0.5-mac-x64.dmg")
    assert.equal(pick({platform: "win32", arch: "x64"}), "Memo-0.0.5-win-x64.exe")
    assert.equal(pick({platform: "linux", arch: "x64"}), "Memo-0.0.5-linux-amd64.deb")
    assert.equal(pick({platform: "linux", arch: "arm64"}), "Memo-0.0.5-linux-arm64.deb")
})

test("a running AppImage is offered an AppImage rather than a deb", () => {
    assert.equal(pick({platform: "linux", arch: "x64", appImage: true}), "Memo-0.0.5-linux-x86_64.AppImage")
    assert.equal(pick({platform: "linux", arch: "arm64", appImage: true}), "Memo-0.0.5-linux-arm64.AppImage")
})

test("an architecture with no build gets no download rather than a wrong one", () => {
    // Falling back to the sole .exe here would hand a 32-bit Windows user a
    // 64-bit installer; the caller shows the release page instead.
    assert.equal(pick({platform: "win32", arch: "ia32"}), null)
    assert.equal(pick({platform: "linux", arch: "arm"}), null)
    assert.equal(pick({platform: "linux", arch: "armv7l"}), null)
    assert.equal(pick({platform: "freebsd", arch: "x64"}), null)
})

test("a release with no usable assets yields no download", () => {
    assert.equal(PickAsset({assets: []}, {platform: "darwin", arch: "arm64"}), null)
    assert.equal(PickAsset({}, {platform: "darwin", arch: "arm64"}), null)
    assert.equal(PickAsset({assets: [{name: "Memo-0.0.5-mac-arm64.dmg"}]}, {platform: "win32", arch: "x64"}), null)
})
