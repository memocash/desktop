const {mnemonicToSeedSync} = require("bip39");
const {fromSeed} = require("bip32");
const {ECPair} = require("@bitcoin-dot-com/bitcoincashjs2-lib");
const {isMainThread, parentPort} = require("worker_threads");
if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async (seedPhrase) => {
    const seed = mnemonicToSeedSync(seedPhrase)
    const node = fromSeed(seed)
    for (let i = 0; i < 20; i++) {
        const child = node.derivePath("m/44'/0'/0'/0/" + i)
        parentPort.postMessage((child))
        //parentPort.postMessage(ECPair.fromWIF(child.toWIF()).getAddress())
    }
});

