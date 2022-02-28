const {Select} = require("./sqlite");
const GetCoins = (addresses) => {
    const query = "" +
        "SELECT " +
        "   outputs.* " +
        "FROM outputs " +
        "LEFT JOIN inputs ON (inputs.prev_hash = outputs.hash AND inputs.prev_index = outputs.`index`) " +
        "WHERE outputs.address IN (" + Array(addresses.length).fill("?").join(", ") + ") " +
        "AND inputs.hash IS NULL " +
        "GROUP BY outputs.hash, outputs.`index` "
    return Select(query, addresses)
}

module.exports = {
    GetCoins,
}
