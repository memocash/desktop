// https://stackoverflow.com/a/3177838/744298
const TimeSince = (date) => {
    if (!(date instanceof Date)) {
        date = Date.parse(date)
    }
    const seconds = Math.floor((new Date() - date) / 1000);
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
