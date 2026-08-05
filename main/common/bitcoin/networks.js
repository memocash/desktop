// Base58check version bytes. BCH kept bitcoin mainnet's legacy prefixes, and
// legacy base58 is the only address form memo transactions carry, so this is
// the whole table the app needs.
const networks = {
    bitcoin: {
        pubKeyHash: 0x00,
        scriptHash: 0x05,
    },
}

module.exports = networks
