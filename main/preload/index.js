const {contextBridge} = require("electron");

contextBridge.exposeInMainWorld('electron', {
    ...require("./data"),
    ...require("./graphql"),
    ...require("./profile"),
    ...require("./theme"),
    ...require("./update"),
    ...require("./wallet"),
    ...require("./window"),
    ...require("./window_tx"),
})
