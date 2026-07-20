const {contextBridge} = require("electron");

contextBridge.exposeInMainWorld('electron', {
    ...require("./common"),
    ...require("./data"),
    ...require("./graphql"),
    ...require("./profile"),
    ...require("./theme"),
    ...require("./wallet"),
    ...require("./window"),
    ...require("./window_tx"),
})
