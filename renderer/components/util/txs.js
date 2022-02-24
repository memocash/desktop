const ShortHash = (hash) => {
    if (hash.length < 12) {
        return hash
    }
    return hash.substring(0, 6) + "..." + hash.substring(hash.length - 6)
}

export default ShortHash
