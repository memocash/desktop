// https://stackoverflow.com/a/3177838/744298
// Ages are floored at zero. The timestamps being aged here are the index
// server's (when it first saw a transaction) and the miners' (block times),
// while "now" is this machine's clock, and nothing keeps the two in step - a
// wallet on a machine whose clock is behind the network is handed timestamps it
// reads as the future. That fell through every unit below, each of which needs
// its interval to exceed 1, and printed the raw negative seconds ("-1637s").
// A timestamp in the future reads as the present instead.
const TimeSince = (date) => {
    if (!(date instanceof Date)) {
        date = Date.parse(date)
    }
    const seconds = Math.max(0, Math.floor((new Date() - date) / 1000));
    let interval = seconds / 31536000;
    if (interval > 1) {
        return Math.floor(interval) + "y";
    }
    /*interval = seconds / 2592000;
    if (interval > 1) {
        return Math.floor(interval) + "m";
    }*/
    interval = seconds / 86400;
    if (interval > 1) {
        return Math.floor(interval) + "d";
    }
    interval = seconds / 3600;
    if (interval > 1) {
        return Math.floor(interval) + "h";
    }
    interval = seconds / 60;
    if (interval > 1) {
        return Math.floor(interval) + "m";
    }
    return Math.floor(seconds) + "s";
}

// Timestamps come out of the db as ISO strings with an offset
// ("2026-07-26T16:05:09-07:00"), which is precise but hard to scan in a table.
// Show it in the user's locale and keep the raw value for the cell's tooltip.
const FormatTimestamp = (timestamp) => {
    if (!timestamp) {
        return "Unknown"
    }
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) {
        return timestamp
    }
    return date.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit",
    })
}

export {
    FormatTimestamp,
    TimeSince,
}
