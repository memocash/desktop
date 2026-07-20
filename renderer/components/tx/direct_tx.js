import bitcoin, {ECPair} from "@bitcoin-dot-com/bitcoincashjs2-lib";
import GetWallet from "../util/wallet";
import {mnemonicToSeedSync} from "bip39";
import bip32 from "../util/bip32";
import {Modals} from "../../../main/common/util"
import bscript from "@bitcoin-dot-com/bitcoincashjs2-lib/src/script";

const Prefix = {
    "6d01": "SetName",
    "6d02": "PostMemo",
    "6d03": "ReplyMemo",
    "6d04": "LikeMemo",
    "6d05": "SetProfile",
    "6d06": "Follow",
    "6d07": "Unfollow",
    "6d0a": "SetPic",
    "6d0c": "ChatPost",
    "6d0d": "ChatFollow",
    "6d0e": "ChatUnfollow",
    "6d20": "LinkRequest",
    "6d21": "LinkAccept",
    "6d22": "LinkRevoke",
}
const setTx = async (outer_transaction, setModal) => {
    const wallet = await GetWallet()
    if (!wallet.seed && !(wallet.keys && wallet.keys.length)) {
        window.electron.showMessageDialog("Watch only wallet does not have private key and cannot sign.")
        return false
    }
    // Seed wallets store their external-path WIFs in wallet.keys, so stored
    // keys and seed derivation aren't either/or: change and SLP path keys are
    // only reachable through the seed. Check both.
    let node
    if (wallet.seed && wallet.seed.length) {
        node = bip32.fromSeed(mnemonicToSeedSync(wallet.seed))
    }
    const derivedLists = [
        {addresses: wallet.addresses || [], path: "m/44'/0'/0'/0/"},
        {addresses: wallet.changeList || [], path: "m/44'/0'/0'/1/"},
        {addresses: wallet.slpList || [], path: "m/44'/245'/0'/0/"},
    ]
    const getKey = (address) => {
        const keys = wallet.keys || []
        for (let i = 0; i < keys.length; i++) {
            const key = ECPair.fromWIF(keys[i])
            if (address === key.getAddress()) {
                return key
            }
        }
        if (!node) {
            return undefined
        }
        for (let j = 0; j < derivedLists.length; j++) {
            const {addresses, path} = derivedLists[j]
            for (let i = 0; i < addresses.length; i++) {
                if (address === addresses[i]) {
                    return ECPair.fromWIF(node.derivePath(path + i).toWIF())
                }
            }
        }
    }
    const tx = bitcoin.Transaction.fromBuffer(outer_transaction.outer_txInfo.raw)
    let txb
    let txBuild
    for (let lockTime = 5e8; lockTime < 5e8 + 2 ^ 12; lockTime++) {
        txb = bitcoin.TransactionBuilder.fromTransaction(tx)
        for (let i = 0; i < outer_transaction.outer_txInfo.inputs.length; i++) {
            const input = outer_transaction.outer_txInfo.inputs[i]
            const key = getKey(input.output.address)
            if (key === undefined) {
                window.electron.showMessageDialog("Unable to find key for input address: " + input.output.address)
                return false
            }
            txb.sign(i, key, undefined, bitcoin.Transaction.SIGHASH_ALL, input.output.value)
        }
        txBuild = txb.build()
        if (!outer_transaction.outer_beatHash.current) {
            break
        }
        const txHash = txBuild.getId()
        if (txHash > outer_transaction.outer_beatHash.current) {
            break
        }
        tx.locktime = lockTime
    }
    const buf = txBuild.toBuffer()
    outer_transaction.outer_txInfo.raw = buf
    const size = buf.length
    outer_transaction.outer_size = size
    outer_transaction.outer_transactionIDEleRef.value = txBuild.getId()
    const feeRate = outer_transaction.outer_fee / size
    outer_transaction.outer_feeRate = feeRate.toFixed((4))
    if (setModal) {
        setModal(Modals.None)
    }
    return true
}
// GraphQL rejections are arrays of {message}, other failures are Errors.
const FormatTxError = (e) => {
    if (Array.isArray(e)) {
        return e.map(err => err && err.message ? err.message : JSON.stringify(err)).join(", ")
    }
    return e && e.message ? e.message : String(e)
}

const pushTx = async (outer_txInfo) => {
    const query = `
    mutation ($raw: String!) {
        broadcast(raw: $raw)
    }
    `
    await window.electron.graphQL(query, {raw: outer_txInfo.raw.toString("hex")})
    console.log("Broadcast successful")
}

const setAndPushTx = async (outer_transaction, setModal, onDone) => {
    if (!await setTx(outer_transaction, setModal)) {
        return
    }
    try {
        await pushTx(outer_transaction.outer_txInfo)
    } catch (e) {
        window.electron.showMessageDialog("Error broadcasting transaction: " + FormatTxError(e))
        return
    }
    if (typeof onDone == "function") {
        onDone()
    }
}
const DirectTx = async (inputs, outputs, beatHash, setModal, onDone, requirePassword) => {
    let outer_transaction = {
        outer_size: 0,
        outer_txInfo: {
            inputs: [],
            outputs: []
        },
        outer_fee: 0,
        outer_transactionIDEleRef: {
            value: 0
        },
        outer_beatHash: {
            current: ""
        },
        outer_feeRate: 0
    }
    if (!requirePassword) {
        let wallet = await GetWallet()
        requirePassword = !wallet.settings.SkipPassword
    }

    if (inputs && inputs.length && outputs && outputs.length) {
        const inputStrings = inputs
        const outputStrings = outputs
        let tx = {
            inputs: [],
            outputs: [],
        }
        let txb = new bitcoin.TransactionBuilder()
        const wallet = await GetWallet()
        const walletAddresses = wallet.addresses.concat(wallet.changeList || [], wallet.slpList || [])
        const isHighlight = (address) => {
            for (let i = 0; i < walletAddresses.length; i++) {
                if (address === walletAddresses[i]) {
                    return true
                }
            }
            return false
        }
        let fee = 0
        for (let i = 0; i < inputStrings.length; i++) {
            const [inputPrevHash, inputPrevIndex, inputValue, inputAddress] = inputStrings[i].split(":")
            const valueInt = parseInt(inputValue)
            const prevIndex = parseInt(inputPrevIndex)
            tx.inputs.push({
                prev_hash: inputPrevHash,
                prev_index: prevIndex,
                highlight: isHighlight(inputAddress),
                output: {
                    value: valueInt,
                    address: inputAddress,
                },
            })
            fee += valueInt
            const outputScript = bitcoin.address.toOutputScript(inputAddress)
            txb.addInput(Buffer.from(inputPrevHash, 'hex').reverse(), prevIndex,
                bitcoin.Transaction.DEFAULT_SEQUENCE, outputScript)
        }
        for (let i = 0; i < outputStrings.length; i++) {
            const [outputScript, outputValue] = outputStrings[i].split(":")
            const scriptBuffer = Buffer.from(outputScript, "hex")
            const valueInt = parseInt(outputValue)
            let outputAddress
            try {
                outputAddress = bitcoin.address.fromOutputScript(scriptBuffer)
            } catch (e) {
                let outputString = bscript.toASM(scriptBuffer)
                if (outputString.startsWith("OP_RETURN ")) {
                    const outputPrefix = outputString.split(" ")[1]
                    const prefixAction = Prefix[outputPrefix]
                    outputAddress = "OP_RETURN: " + prefixAction
                } else {
                    outputAddress = "unknown: nonstandard"
                }
            }
            tx.outputs.push({
                address: outputAddress,
                value: valueInt,
                highlight: isHighlight(outputAddress),
            })
            txb.addOutput(scriptBuffer, valueInt)
            fee -= valueInt
        }
        const txBuild = txb.__build(true)
        const buf = txBuild.toBuffer()
        tx.raw = buf
        outer_transaction.outer_size = buf.length
        outer_transaction.outer_txInfo = tx
        outer_transaction.outer_fee = fee
        outer_transaction.outer_transactionIDEleRef.value = txBuild.getId()
        outer_transaction.outer_beatHash.current = beatHash
        const storedPassword = await window.electron.getPassword()
        if (!storedPassword || !storedPassword.length || !requirePassword) {
            await setAndPushTx(outer_transaction, setModal, onDone)
        } else {
            setModal(Modals.Password, {
                onCorrectPassword: async () => {
                    await setAndPushTx(outer_transaction, setModal, onDone)
                }
            })
        }
    }
}
export {DirectTx, setTx, pushTx, FormatTxError}
