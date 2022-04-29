const GetId = () => {
    return Date.now() + "_" + Math.floor(Math.random() * 1e6)
}

module.exports = {
    GetId: GetId,
}
