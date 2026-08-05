import bitcoin, {script as bscript} from "../util/bitcoincash";
import GetWallet from "../util/wallet";
import {Modals, WalletErrors} from "../../../main/common/util"

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
    "6d26": "SetAlias",
}
const setTx = async (outer_transaction, setModal) => {
    const wallet = await GetWallet()
    if (!wallet.canSign) {
        window.electron.showMessageDialog("Watch only wallet does not have private key and cannot sign.")
        return false
    }
    const {error, value} = await window.electron.signTransaction({
        raw: Buffer.from(outer_transaction.outer_txInfo.raw).toString("hex"),
        inputs: outer_transaction.outer_txInfo.inputs.map(({prev_hash, prev_index}) =>
            ({prev_hash, prev_index})),
        beatHash: outer_transaction.outer_beatHash.current,
    })
    if (error) {
        // Cancelling main's prompt isn't a failure to report back: the person
        // just said no, to a question this page never saw them being asked.
        if (error === WalletErrors.SpendCancelled) {
            return WalletErrors.SpendCancelled
        }
        window.electron.showMessageDialog("Unable to sign transaction: " + error)
        return false
    }
    const buf = Buffer.from(value.raw, "hex")
    outer_transaction.outer_txInfo.raw = buf
    for (let i = 0; i < value.inputs.length; i++) {
        outer_transaction.outer_txInfo.inputs[i].output = value.inputs[i]
    }
    outer_transaction.outer_size = value.size
    outer_transaction.outer_fee = value.fee
    outer_transaction.outer_transactionIDEleRef.value = value.txid
    outer_transaction.outer_feeRate = value.feeRate.toFixed(4)
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
    const signed = await setTx(outer_transaction, setModal)
    if (signed !== true) {
        return signed
    }
    try {
        await pushTx(outer_transaction.outer_txInfo)
    } catch (e) {
        window.electron.showMessageDialog("Error broadcasting transaction: " + FormatTxError(e))
        return false
    }
    if (typeof onDone == "function") {
        onDone()
    }
    return true
}
const DirectTx = async (inputs, outputs, beatHash, setModal, onDone) => {
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
    if (inputs && inputs.length && outputs && outputs.length) {
        const inputStrings = inputs
        const outputStrings = outputs
        let tx = {
            inputs: [],
            outputs: [],
        }
        let txb = new bitcoin.Transaction()
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
            txb.addInput(Buffer.from(inputPrevHash, 'hex').reverse(), prevIndex)
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
        const buf = txb.toBuffer()
        tx.raw = buf
        outer_transaction.outer_size = buf.length
        outer_transaction.outer_txInfo = tx
        outer_transaction.outer_fee = fee
        outer_transaction.outer_transactionIDEleRef.value = txb.getId()
        outer_transaction.outer_beatHash.current = beatHash
        // No password crosses from here at all. Main signs on the session if the
        // budget covers it, and otherwise asks for the password and confirms the
        // destinations in a window of its own, which this page cannot reach.
        await setAndPushTx(outer_transaction, setModal, onDone)
    }
}
export {DirectTx, setTx, pushTx, FormatTxError}
