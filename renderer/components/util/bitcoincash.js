// The renderer's single doorway to bitcoin primitives (audit D4). Everything
// here is the app's own code in main/common/bitcoin over @noble/hashes - the
// unmaintained @bitcoin-dot-com/bitcoincashjs2-lib these modules replaced is
// gone. Key material never enters the renderer: WIF handling here is the
// structural check only, and deriving or signing stays in main.
import addressModule from "../../../main/common/bitcoin/address";
import networksModule from "../../../main/common/bitcoin/networks";
import scriptModule from "../../../main/common/bitcoin/script";
import opcodesModule from "../../../main/common/bitcoin/opcodes.json";
import {Transaction} from "../../../main/common/bitcoin/transaction";
import {IsValidWif} from "../../../main/common/bitcoin/wif";

export const address = addressModule
export const networks = networksModule
export const script = scriptModule
export const opcodes = opcodesModule
export {Transaction, IsValidWif}

export default {
    address: addressModule,
    networks: networksModule,
    script: scriptModule,
    opcodes: opcodesModule,
    Transaction: Transaction,
}
