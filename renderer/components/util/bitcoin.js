const Fee = {
    Base: 10,
    InputP2PKH: 148,
    OutputP2PKH: 34,
    OutputFeeOpReturn: 20,
    OutputValueSize: 9, // 8 + 1
}

const Prefix = {
    SetName: "6d01",
    PostMemo: "6d02",
    ReplyMemo: "6d03",
    LikeMemo: "6d04",
    SetProfile: "6d05",
    SetPic: "6d0a",
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
};

export default {
    DustLimit: 546,
    MaxOpReturn: 100000,
    Fee: Fee,
    Utf8ByteLength: Utf8ByteLength,
    Prefix: Prefix,
}
