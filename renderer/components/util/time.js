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

export {
    TimeSince,
}
