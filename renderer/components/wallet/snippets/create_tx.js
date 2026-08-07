import {BuildTransaction, CreateDirectTransaction} from "./create_direct_tx";

// The preview path: same selection and assembly as the direct path (see
// BuildTransaction), handed to the preview window instead of signed here.
const CreateTransactionWithPreview = async (wallet, outputs, beatHash = "", coin = "", fromAddress = "") => {
    const built = BuildTransaction(wallet, outputs, coin, fromAddress)
    if (!built) {
        return
    }
    await window.electron.openPreviewSend({inputs: built.inputs, outputs: built.outputs, beatHash})
}

const CreateTransaction = async (wallet, outputs, setModal, onDone, beatHash = "",
                                 fromAddress = "") => {
    if (wallet.settings.DirectTx) {
        await CreateDirectTransaction(wallet, outputs, setModal, onDone, beatHash, "", fromAddress)
    } else {
        await CreateTransactionWithPreview(wallet, outputs, beatHash, "", fromAddress)
    }
}

export {
    CreateTransaction,
    CreateTransactionWithPreview
}
