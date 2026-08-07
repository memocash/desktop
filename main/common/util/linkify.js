// Finds the link-shaped spans in untrusted post and profile text. The renderer
// turns the segments into elements; keeping the decisions here - what matches,
// what is safe to link, what gets an image preview offer - means they run
// under the main test suite, which has no JSX toolchain to drive the component
// itself.
const LinkifyIt = require("linkify-it")
const tlds = require("tlds")
const {SafeExternalUrl} = require("./urls")

// The full IANA list rather than linkify-it's small built-in set, so bare
// domains on newer TLDs - memo.cash among them - still register as links.
const linkify = new LinkifyIt()
linkify.tlds(tlds)

const imageExtension = /^\/[a-zA-Z0-9]+\.(jpg|jpeg|png|gif|webp)$/

// Only direct i.imgur.com image paths get the inline-preview offer; lookalike
// hosts, nested paths, and other extensions stay ordinary links.
const GetImgurImage = (href) => {
    let url
    try {
        url = new URL(href)
    } catch (e) {
        return null
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        return null
    }
    if (url.hostname !== "i.imgur.com" || !imageExtension.test(url.pathname)) {
        return null
    }
    return "https://i.imgur.com" + url.pathname
}

// Splits text into segments whose text fields concatenate back to the input
// exactly. A segment with a url is safe to render as an anchor - the url is
// SafeExternalUrl's normalized form, not the matched text. A match whose
// scheme fails that check (mailto from bare emails, ftp) stays plain text.
const LinkSegments = (text) => {
    const matches = linkify.match(text) || []
    const segments = []
    let lastIndex = 0
    for (const match of matches) {
        if (match.index > lastIndex) {
            segments.push({text: text.substring(lastIndex, match.index)})
        }
        const url = SafeExternalUrl(match.url)
        if (!url) {
            segments.push({text: match.text})
        } else {
            const imgurSrc = GetImgurImage(url)
            segments.push(imgurSrc ? {text: match.text, url: url, imgurSrc: imgurSrc} : {text: match.text, url: url})
        }
        lastIndex = match.lastIndex
    }
    if (text.length > lastIndex) {
        segments.push({text: text.substring(lastIndex)})
    }
    return segments
}

module.exports = {
    GetImgurImage: GetImgurImage,
    LinkSegments: LinkSegments,
}
