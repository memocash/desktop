const {nativeImage} = require("electron")

// Every pic renders at 75px or less, and the renderer ships each one to a list
// row as a base64 data url, so a stored pic only needs to be display-sized.
// Shrinking on save is what lets the download accept the multi-megabyte
// uploads an image host happily serves: the transfer is bounded by the
// download cap, the row by this.
const MaxPicPixels = 256

// The most bytes any stored pic may have. A decodable image is re-encoded to
// fit; a gif or webp, which Electron's decoder doesn't read, keeps its
// downloaded bytes only while it fits.
const MaxStoredBytes = 2 * 1024 * 1024

// The most pixels a source is allowed before it's decoded. Pic URLs are
// untrusted, and a PNG a few hundred KB long can declare dimensions that
// decode to gigabytes, so the dimensions are read from the header (no
// allocation) and a source past this is refused rather than decoded. 16 MP
// takes a phone photo (12 MP) and decodes to 64 MB at most.
const MaxSourcePixels = 16 * 1024 * 1024

const isPng = (data) => data.length >= 8 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(4) === 0x0d0a1a0a
const isJpeg = (data) => data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff

// PNG: the IHDR chunk is required to come first, right after the signature.
const pngDimensions = (data) => {
    if (data.length < 24 || data.toString("ascii", 12, 16) !== "IHDR") {
        return undefined
    }
    return {width: data.readUInt32BE(16), height: data.readUInt32BE(20)}
}

// JPEG: walk the marker segments to the first start-of-frame, which carries
// the dimensions. C4 (huffman table), C8 (reserved) and CC (arithmetic
// conditioning) share the SOF range but aren't frames.
const jpegDimensions = (data) => {
    let offset = 2
    while (offset + 4 <= data.length) {
        if (data[offset] !== 0xff) {
            return undefined
        }
        const marker = data[offset + 1]
        if (marker === 0xff) {
            offset += 1
            continue
        }
        if (marker >= 0xd0 && marker <= 0xd9 || marker === 0x01) {
            offset += 2
            continue
        }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
            if (offset + 9 > data.length) {
                return undefined
            }
            return {height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7)}
        }
        offset += 2 + data.readUInt16BE(offset + 2)
    }
    return undefined
}

// The dimensions declared by a PNG or JPEG header, without decoding it.
// Undefined for anything else, or a header too broken to say.
const ImageDimensions = (data) => {
    if (isPng(data)) {
        return pngDimensions(data)
    }
    if (isJpeg(data)) {
        return jpegDimensions(data)
    }
    return undefined
}

// The bytes to store for a PNG or JPEG: the original when it already fits
// both the pixel and the byte bounds, a display-sized re-encode otherwise.
// Undefined when it isn't a format handled here, so the caller applies the
// byte cap instead. An empty buffer when the source is refused: declared
// dimensions past MaxSourcePixels, or a decoder that couldn't read it.
const ShrinkImage = (data) => {
    const declared = ImageDimensions(data)
    if (!declared) {
        return undefined
    }
    if (declared.width * declared.height > MaxSourcePixels) {
        return Buffer.alloc(0)
    }
    if (declared.width <= MaxPicPixels && declared.height <= MaxPicPixels && data.length <= MaxStoredBytes) {
        return data
    }
    const image = nativeImage.createFromBuffer(data)
    if (image.isEmpty()) {
        return Buffer.alloc(0)
    }
    const {width, height} = image.getSize()
    const bounds = width >= height ? {width: Math.min(width, MaxPicPixels)} : {height: Math.min(height, MaxPicPixels)}
    const resized = image.resize({...bounds, quality: "best"})
    return isJpeg(data) ? resized.toJPEG(85) : resized.toPNG()
}

module.exports = {
    ImageDimensions,
    MaxPicPixels,
    MaxSourcePixels,
    MaxStoredBytes,
    ShrinkImage,
}
