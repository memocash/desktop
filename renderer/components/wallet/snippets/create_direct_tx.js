import {address} from "../../util/bitcoincash";
import {GetUtxos} from "../../util/utxos";
import {BuildTx} from "../../util/tx_build";
import {DirectTx} from "../../tx/direct_tx";

// The selection and assembly live in util/tx_build (commonjs, tested
// directly); this wrapper supplies the wallet's utxos and change script and
// owns telling the user when the wallet cannot fund the outputs. Returns
// {inputs, outputs} ready to sign, or null after the dialog.
const BuildTransaction = (wallet, outputs, coin = "", fromAddress = "") => {
    const built = BuildTx({
        utxos: GetUtxos(),
        outputs,
        coin,
        fromAddress,
        changeScript: address.toOutputScript(wallet.addresses[0]).toString("hex"),
    })
    if (!built) {
        window.electron.showMessageDialog(fromAddress !== "" ?
            "Not enough value on " + fromAddress + " to complete this transaction" :
            "Not enough value in wallet to complete this transaction")
    }
    return built
}

const CreateDirectTransaction = async (wallet, outputs, setModal, onDone, beatHash = "", coin = "",
                                       fromAddress = "") => {
    const built = BuildTransaction(wallet, outputs, coin, fromAddress)
    if (!built) {
        return
    }
    await DirectTx(built.inputs, built.outputs, beatHash, setModal, onDone)
}

export {
    BuildTransaction,
    CreateDirectTransaction,
}
