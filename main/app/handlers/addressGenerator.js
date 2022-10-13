const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPairFactory: ECPair} = require("ecpair");
const {isMainThread, parentPort} = require("worker_threads");
if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async (seedPhrase) => {
    const seed = mnemonicToSeedSync(seedPhrase)
    const node = fromSeed(seed)
    for (let i = 0; i < 20; i++) {
        const child = node.derivePath("m/44'/0'/0'/0/" + i)
        const childWif = child.toWIF()
        const pair = ECPair.fromWIF(childWif)
        const address = pair.getAddress()
        parentPort.postMessage(address)
    }
});
