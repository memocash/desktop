const {contextBridge} = require("electron");

contextBridge.exposeInMainWorld('electron', {
    ...require("./data"),
    ...require("./graphql"),
    ...require("./profile"),
    ...require("./sync"),
    ...require("./theme"),
    ...require("./update"),
    ...require("./wallet"),
    ...require("./window"),
    ...require("./window_tx"),
})
