const Handlers = {
    GetAddressesRoomFollowCount: "get-addresses-room-follow-count",
    GetChatFollows: "get-chat-follows",
    GetChatPosts: "get-chat-posts",
    GetChatRoomFollowCount: "get-chat-room-follow-count",
    GetChatRoomFollows: "get-chat-room-follows",
    GetProfileInfo: "get-profile-info",
    GetRecentRoomFollow: "get-recent-room-follow",
    GetRecentSetName: "get-recent-set-name",
    GetRecentSetProfile: "get-recent-set-profile",
    GetRecentSetPic: "get-recent-set-pic",
    GetRecentFollow: "get-recent-follow",
    GetFollowers: "get-followers",
    GetFollowing: "get-following",
    GetLikes: "get-likes",
    GetPost: "get-post",
    GetPosts: "get-posts",
    GetPostParent: "get-post-parent",
    GetPostReplies: "get-post-replies",
    SetWindowStorage: "set-window-storage",
    GetWindowStorage: "get-window-storage",
    RightClickMenu: "right-click-menu",
    CoinsMenu: "coins-menu",
    BrowserWindowFocus: "browser-window-focus",
    OpenFileDialog: "open-file-dialog",
    ShowMessageDialog: "show-message-dialog",
    GetWindowId: "get-window-id",
    CloseWindow: "close-window",
    StoreWallet: "store-wallet",
    GetWallet: "get-wallet",
    WalletLoaded: "wallet-loaded",
    GetWalletInfo: "get-wallet-info",
    GraphQL: "graphql",
    GraphQLSubscribe: "graphql-subscribe",
    GraphQLSubscribeClose: "graphql-subscribe-close",
    GetWindowNetwork: "get-window-network",
    SetWindowNetwork: "set-window-network",
    OpenPreviewSend: "open-preview-send",
    OpenTransaction: "open-transaction",
    SaveTransactions: "save-transactions",
    SaveBlock: "save-block",
    SaveChatRoom: "save-chat-room",
    SaveChatRoomFollows: "save-chat-room-follows",
    SaveMemoPosts: "save-memo-posts",
    SaveMemoProfileImages: "save-memo-profile-images",
    SaveMemoProfiles: "save-memo-profiles",
    GetPic: "get-pic",
    GenerateHistory: "generate-history",
    GetTransactions: "get-transactions",
    GetUtxos: "get-utxos",
    GetTransaction: "get-transaction",
    GetCoins: "get-coins",
    GetRecentAddresses: "get-recent-addresses",
}

const Listeners = {
    DisplayModal: "display-modal",
    GraphQLClosePrefix: "graphql-close-",
    GraphQLDataPrefix: "graphql-data-",
    GraphQLOpenPrefix: "graphql-open-",
}

module.exports = {
    Handlers: Handlers,
    Listeners: Listeners,
}
