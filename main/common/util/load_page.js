// The load page - choose or create a wallet, type its password, write down a
// seed - is built into the export beside the pages the app origin serves,
// but it is served by nobody: main loads its shell from disk in a window of
// its own (see main/app/window.js), so that no page holding a wallet can
// frame it, navigate to it, or present it. Being in the export tree would
// undo that quietly - the app:// handler and the dev server both resolve a
// directory to its index.html, and a wallet page may navigate its own window
// anywhere on the app origin - so both refuse the page's files by this one
// rule: its shell directory, and its bundles under assets/. Case-blind,
// since the filesystems the app ships on mostly are, and a request differing
// only in case would otherwise open what the exact name refuses. Blind to
// trailing dots and spaces on a segment too: Windows drops them when it opens
// a name, so "load." and "load " are the load directory there, and a check
// that read them as other names would be the one thing standing between a
// wallet page and a served copy of the password screen.
const LoadPageName = "load"

const IsLoadPagePath = (relativePath) => {
    const [first, second] = relativePath.toLowerCase().split(/[\\/]/)
        .map((segment) => segment.replace(/[. ]+$/, ""))
    return first === LoadPageName
        || (first === "assets" && second !== undefined && second.startsWith(LoadPageName + "."))
}

module.exports = {IsLoadPagePath}
