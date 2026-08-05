// Every url that reaches the OS handler or gets rendered as a clickable link
// passes through here first. Most of them are untrusted: a memo profile pic url
// is arbitrary bytes any stranger can write on chain, and it ends up both in the
// transaction viewer and in the pic downloader.
//
// Only plain http(s) survives. The schemes being kept out:
//
// - javascript: runs in the window that rendered the link. React emits such an
//   href unchanged (it only warns, and only in development), so the check has to
//   happen here rather than being assumed of the framework.
// - data: can carry a whole html document, script included.
// - file:, and OS-handled schemes like ms-msdt:, hand the operating system
//   something it will open or launch.
//
// Callers use the returned normalized url rather than the string they passed in,
// so an obfuscated form can't be validated in one shape and used in another -
// "java\nscript:alert(1)" parses as javascript: here but would be read as a
// scheme-less relative path by anything matching on the raw text.
const ExternalProtocols = ["http:", "https:"]

const SafeExternalUrl = (url) => {
    if (typeof url !== "string" || !url.length) {
        return null
    }
    let parsed
    try {
        parsed = new URL(url)
    } catch (e) {
        // Relative and malformed values, including protocol-relative "//host/x",
        // which has no scheme to vouch for and so is never opened externally.
        return null
    }
    if (!ExternalProtocols.includes(parsed.protocol)) {
        return null
    }
    return parsed.href
}

// Whether a url belongs to the app itself, i.e. is somewhere a window is allowed
// to navigate. The app:// scheme used by packaged builds is not a "special"
// scheme, so its origin parses as null and cannot be compared - protocol and
// host have to be checked individually.
const IsSameOrigin = (url, appUrl) => {
    let parsed
    let app
    try {
        parsed = new URL(url)
        app = new URL(appUrl)
    } catch (e) {
        return false
    }
    return parsed.protocol === app.protocol && parsed.host === app.host
}

module.exports = {
    IsSameOrigin: IsSameOrigin,
    SafeExternalUrl: SafeExternalUrl,
}
