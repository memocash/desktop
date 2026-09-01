import bitcoin from "./bitcoincash";
// Fee lives with the selection logic in tx_build (commonjs, for the tests);
// re-exported here so bitcoin.Fee keeps working everywhere.
import {Fee} from "./tx_build";
// The memo action prefixes are shared with main, which reads them out of
// transactions when it syncs aliases.
import {Prefix} from "../../../main/common/memo";

const Utf8ByteLength = (str) => {
    if (str === undefined) {
        return 0;
    }
    // returns the byte length of an utf8 string
    let s = str.length;
    for (let i = s - 1; i >= 0; i--) {
        let code = str.charCodeAt(i);
        if (code > 0x7f && code <= 0x7ff) s++;
        else if (code > 0x7ff && code <= 0xffff) s += 2;
        if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
    }
    return parseInt(s);
}

const GetPkHashFromAddress = (addressString) => {
    const address = bitcoin.address.fromBase58Check(addressString)
    return address.hash
}

export default {
    Fee: Fee,
    Utf8ByteLength: Utf8ByteLength,
    GetPkHashFromAddress,
    Prefix: Prefix,
}
