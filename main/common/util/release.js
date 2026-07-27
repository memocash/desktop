// Pure reasoning about GitHub releases: which published release a given install
// should be offered, and which asset belongs to the machine it is running on.
// Deliberately free of electron and of process globals (the caller passes a
// target) so the rules can be exercised directly - see release.test.js.

// Release tags have not always been strict semver (0.0.2b, 0.0.2-d, 0.0.4-rc1),
// so compare the numeric core first and let the suffix break the tie. The
// separator decides what the suffix means, which is how both conventions used in
// this repo sort correctly:
//   0.0.4-rc2 < 0.0.4   a hyphenated suffix is a semver prerelease
//   0.0.2 < 0.0.2b      a letter tacked straight on is a later patch
const SuffixRank = {Prerelease: 0, None: 1, Patch: 2}

const ParseVersion = (version) => {
    const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/.exec(String(version || "").trim())
    if (!match) {
        return null
    }
    const suffix = match[4].toLowerCase()
    return {
        core: [match[1], match[2], match[3]].map((part) => parseInt(part || "0", 10)),
        suffix: suffix.replace(/^[-.]/, ""),
        rank: !suffix ? SuffixRank.None : (/^[-.]/.test(suffix) ? SuffixRank.Prerelease : SuffixRank.Patch),
    }
}

// Compares suffixes digit-run by digit-run so rc10 sorts above rc2.
const CompareSuffixes = (a, b) => {
    const chunks = (suffix) => suffix.match(/\d+|\D+/g) || []
    const aChunks = chunks(a)
    const bChunks = chunks(b)
    for (let i = 0; i < Math.max(aChunks.length, bChunks.length); i++) {
        const aChunk = aChunks[i]
        const bChunk = bChunks[i]
        if (aChunk === undefined) {
            return -1
        }
        if (bChunk === undefined) {
            return 1
        }
        if (/^\d/.test(aChunk) && /^\d/.test(bChunk)) {
            const diff = parseInt(aChunk, 10) - parseInt(bChunk, 10)
            if (diff !== 0) {
                return diff < 0 ? -1 : 1
            }
        } else if (aChunk !== bChunk) {
            return aChunk < bChunk ? -1 : 1
        }
    }
    return 0
}

const CompareVersions = (a, b) => {
    const parsedA = ParseVersion(a)
    const parsedB = ParseVersion(b)
    if (!parsedA || !parsedB) {
        return 0
    }
    for (let i = 0; i < 3; i++) {
        if (parsedA.core[i] !== parsedB.core[i]) {
            return parsedA.core[i] < parsedB.core[i] ? -1 : 1
        }
    }
    if (parsedA.rank !== parsedB.rank) {
        return parsedA.rank < parsedB.rank ? -1 : 1
    }
    if (parsedA.suffix === parsedB.suffix) {
        return 0
    }
    return CompareSuffixes(parsedA.suffix, parsedB.suffix)
}

const IsPrerelease = (version) => {
    const parsed = ParseVersion(version)
    return !!parsed && parsed.rank === SuffixRank.Prerelease
}

// Someone running a prerelease is opted in to prereleases and keeps seeing them;
// everyone else is only offered final releases.
const PickLatestRelease = (releases, currentVersion) => {
    if (!Array.isArray(releases)) {
        return null
    }
    const allowPrerelease = IsPrerelease(currentVersion)
    let latest = null
    for (const release of releases) {
        if (!release || release.draft || !release.tag_name) {
            continue
        }
        if (!allowPrerelease && (release.prerelease || IsPrerelease(release.tag_name))) {
            continue
        }
        if (!latest || CompareVersions(release.tag_name, latest.tag_name) > 0) {
            latest = release
        }
    }
    return latest
}

// electron-builder names artifacts Memo-<version>-<os>-<arch>.<ext> (see
// artifactName in package.json), but the arch token follows each target's own
// convention: published releases carry linux-amd64.deb and linux-x86_64.AppImage
// alongside mac-x64.dmg, so every spelling of an architecture is listed here.
// The token is matched between delimiters rather than as a bare substring, since
// "arm" appears inside "arm64" and a 32-bit machine must not be handed a 64-bit
// installer. An architecture with no entry matches nothing at all, which leaves
// the caller offering the release page instead of an unrunnable download.
const ArchMatchers = {
    x64: /(^|[-_.])(x64|amd64|x86_64)([-_.]|$)/,
    arm64: /(^|[-_.])(arm64|aarch64)([-_.]|$)/,
}

const MatchesArch = (name, arch) => {
    const matcher = ArchMatchers[arch]
    return !!matcher && matcher.test(name)
}

// Linux gets whichever format matches how the app is running; the caller decides
// that, since only a running AppImage knows it is one.
const AssetExtensions = ({platform, appImage}) => {
    switch (platform) {
        case "darwin":
            return [".dmg", ".zip"]
        case "win32":
            return [".exe"]
        case "linux":
            return appImage ? [".AppImage", ".deb"] : [".deb", ".AppImage"]
        default:
            return []
    }
}

// Every release ever published names the architecture in every asset, so an
// asset that does not match is genuinely not for this machine - there is no
// arch-less name to fall back to, and guessing would mean handing someone an
// installer that cannot run.
const PickAsset = (release, target) => {
    const assets = Array.isArray(release && release.assets) ? release.assets : []
    for (const extension of AssetExtensions(target)) {
        const asset = assets.find((asset) => asset && asset.name &&
            asset.name.endsWith(extension) && MatchesArch(asset.name, target.arch))
        if (asset) {
            return {name: asset.name, url: asset.browser_download_url, size: asset.size}
        }
    }
    return null
}

module.exports = {
    CompareVersions,
    IsPrerelease,
    MatchesArch,
    PickAsset,
    PickLatestRelease,
}
