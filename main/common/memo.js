// The memo protocol's OP_RETURN action prefixes, as the two-byte hex each
// action's script opens with. Shared by main's sync (which reads aliases and
// post actions out of transactions) and the renderer's transaction builders.
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
    LinkRequest: "6d20",
    LinkAccept: "6d21",
    LinkRevoke: "6d22",
    Send: "6d24",
    SetAlias: "6d26",
}

module.exports = {
    Prefix,
}
