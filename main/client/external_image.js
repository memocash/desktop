const dns = require("dns")
const http = require("http")
const https = require("https")
const net = require("net")
const {SafeExternalUrl} = require("../common/util/urls")

// Bounds the transfer only. What gets stored is display-sized by
// shrink_image.js, so this just has to clear what image hosts serve for an
// avatar; the earlier 512 KiB cap rejected ordinary imgur uploads.
const MaxImageBytes = 8 * 1024 * 1024
const RequestTimeoutMs = 10_000
const MaxRedirects = 5

class PermanentImageError extends Error {
    constructor(message) {
        super(message)
        this.name = "PermanentImageError"
        this.permanent = true
    }
}

const blockedAddresses = new net.BlockList()
for (const [network, prefix] of [
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
    ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
    ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]) {
    blockedAddresses.addSubnet(network, prefix, "ipv4")
}
for (const [network, prefix] of [
    ["::", 128], ["::1", 128], ["100::", 64], ["2001:db8::", 32],
    ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
]) {
    blockedAddresses.addSubnet(network, prefix, "ipv6")
}

const IsPublicAddress = (address) => {
    const family = net.isIP(address)
    if (!family) {
        return false
    }
    return !blockedAddresses.check(address, family === 4 ? "ipv4" : "ipv6")
}

// Resolve inside the socket connection and reject the whole hostname if any
// answer is non-public. This avoids a check-then-connect DNS rebinding window.
const publicLookup = (hostname, options, callback) => {
    dns.lookup(hostname, {...options, all: true}, (error, addresses) => {
        if (error) {
            callback(error)
            return
        }
        if (!addresses.length || addresses.some(({address}) => !IsPublicAddress(address))) {
            callback(new PermanentImageError("Profile image host resolves to a non-public address"))
            return
        }
        if (options.all) {
            callback(null, addresses)
        } else {
            callback(null, addresses[0].address, addresses[0].family)
        }
    })
}

const readBody = (response, maxBytes) => new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    response.on("data", (chunk) => {
        size += chunk.length
        if (size > maxBytes) {
            response.destroy(new PermanentImageError("Profile image exceeds size limit"))
            return
        }
        chunks.push(chunk)
    })
    response.on("end", () => resolve(Buffer.concat(chunks, size)))
    response.on("error", reject)
})

const downloadUntil = (input, redirects, deadline) => new Promise((resolve, reject) => {
    const safeUrl = SafeExternalUrl(input)
    if (!safeUrl) {
        reject(new PermanentImageError("Invalid profile image URL"))
        return
    }
    const url = new URL(safeUrl)
    const literalHost = url.hostname.replace(/^\[|\]$/g, "")
    if (net.isIP(literalHost) && !IsPublicAddress(literalHost)) {
        reject(new PermanentImageError("Profile image host is a non-public address"))
        return
    }
    const remaining = deadline - Date.now()
    if (remaining <= 0) {
        reject(new Error("Profile image request timed out"))
        return
    }
    const client = url.protocol === "https:" ? https : http
    let settled = false
    let timer
    const finish = (callback, value) => {
        if (settled) {
            return
        }
        settled = true
        clearTimeout(timer)
        callback(value)
    }
    const request = client.get(url, {lookup: publicLookup, timeout: remaining}, async (response) => {
        try {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                response.resume()
                if (redirects >= MaxRedirects) {
                    throw new Error("Too many profile image redirects")
                }
                const next = new URL(response.headers.location, url).href
                finish(resolve, await downloadUntil(next, redirects + 1, deadline))
                return
            }
            if (response.statusCode < 200 || response.statusCode >= 300) {
                response.resume()
                const error = new Error("Profile image returned status " + response.statusCode)
                error.statusCode = response.statusCode
                throw error
            }
            const length = Number(response.headers["content-length"])
            if (Number.isFinite(length) && length > MaxImageBytes) {
                response.resume()
                throw new PermanentImageError("Profile image exceeds size limit")
            }
            finish(resolve, await readBody(response, MaxImageBytes))
        } catch (error) {
            finish(reject, error)
        }
    })
    if (!settled) {
        timer = setTimeout(() => request.destroy(new Error("Profile image request timed out")), remaining)
    }
    request.on("timeout", () => request.destroy(new Error("Profile image request timed out")))
    request.on("error", (error) => finish(reject, error))
})

const DownloadExternalImage = (input) => downloadUntil(input, 0, Date.now() + RequestTimeoutMs)

module.exports = {
    DownloadExternalImage,
    IsPublicAddress,
    MaxImageBytes,
    PermanentImageError,
    downloadUntil,
}
