import {mnemonicToSeedSync} from "bip39";
import {fromSeed} from "bip32";
import {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import {isMainThread, parentPort} from "worker_threads";

if (isMainThread) {
    throw new Error('Its not a worker');
}

parentPort.on("message", async (seedPhrase) => {
    console.log("workerSeedPhrase", seedPhrase)
    const seed = mnemonicToSeedSync(seedPhrase)
    const node = fromSeed(seed)
    for (let i = 0; i < 20; i++) {
        const child = node.derivePath("m/44'/0'/0'/0/" + i)
        parentPort.postMessage(ECPair.fromWIF(child.toWIF()).getAddress())
    }
});
