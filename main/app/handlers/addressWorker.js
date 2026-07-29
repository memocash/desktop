const {parentPort, workerData} = require("worker_threads")
const {derivePrivateWallet, derivePublicWallet} = require("../derivation")

try {
    const result = workerData.derivation
        ? derivePublicWallet(workerData.derivation)
        : derivePrivateWallet(workerData.seed, workerData.keys)
    parentPort.postMessage({result})
} catch (e) {
    parentPort.postMessage({error: e.message})
}
