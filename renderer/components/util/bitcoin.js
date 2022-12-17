import bitcoin from "@bitcoin-dot-com/bitcoincashjs2-lib";

const Fee = {
    Base: 10,
    InputP2PKH: 148,
    OutputP2PKH: 34,
    OutputFeeOpReturn: 20,
    OutputValueSize: 9, // 8 + 1
    DustLimit: 546,
    TxHashByteLength: 32,
    OpPushDataBase: 3,
    MaxOpReturn: 217,
    MaxOpReturnBsv: 100000,
    GetMaxContentWithTxHash: () => {
        return Fee.MaxOpReturn - Fee.OpPushDataBase - Fee.TxHashByteLength
    },
}

const Prefix = {
    SetName: "6d01",
    PostMemo: "6d02",
    ReplyMemo: "6d03",
    LikeMemo: "6d04",
    SetProfile: "6d05",
    Follow: "6d06",
    Unfollow: "6d07",
    SetPic: "6d0a",
    ChatPost: "6d0c",
    ChatFollow: "6d0d",
    ChatUnfollow: "6d0e",
    Send: "6d24",
}

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
