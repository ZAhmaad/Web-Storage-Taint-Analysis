"use strict";

function isSourceLabel(lbl) {
    return (
        isSourceLabelRelatedTo(lbl, "storage") ||
        isSourceLabelRelatedTo(lbl, "cookies") ||
        isSourceLabelRelatedTo(lbl, "network") ||
        isSourceLabelRelatedTo(lbl, "location") ||
        isSourceLabelRelatedTo(lbl, "navigator")
    );
}

function isSinkLabel(lbl) {
    return (
        isSinkLabelRelatedTo(lbl, "storage") ||
        isSinkLabelRelatedTo(lbl, "cookies") ||
        isSinkLabelRelatedTo(lbl, "network")
    );
}

function isSourceLabelRelatedTo(lbl, what) {
    switch (what) {
        case "storage":
            return isSourceLabelRelatedToStorage(lbl);
        case "cookies":
            return isLabelRelatedToCookies(lbl);
        case "network":
            return isSourceLabelRelatedToNetwork(lbl);
        case "location":
            return isLabelRelatedToLocation(lbl);
        case "navigator":
            return isLabelRelatedToNavigator(lbl);
        default:
            throw new Error(`Classification '${what}' does not exists.`);
    }
}

function isSinkLabelRelatedTo(lbl, what) {
    switch (what) {
        case "storage":
            return isSinkLabelRelatedToStorage(lbl);
        case "cookies":
            return isLabelRelatedToCookies(lbl);
        case "network":
            return isSinkLabelRelatedToNetwork(lbl);
        case "location":
            return false;
        case "navigator":
            return false;
        default:
            throw new Error(`Classification '${what}' does not exists.`);
    }
}

function isSourceLabelRelatedToStorage(lbl) {
    return (
        lbl.name === "[Storage].getItem()" ||
        lbl.name === "[Storage][p]"
    );
}

function isSinkLabelRelatedToStorage(lbl) {
    return (
        lbl.name === "[Storage].setItem()" ||
        lbl.name === "[Storage][p]"
    );
}

function isLabelRelatedToCookies(lbl) {
    return lbl.name === "document.cookie";
}

function isSourceLabelRelatedToNetwork(lbl) {
    return (
        (lbl.name === "[XMLHttpRequest].response")
    );
}

function isSinkLabelRelatedToNetwork(lbl) {
    return (
        (lbl.name === "[XMLHttpRequest][f]()" && lbl.extra[2] === "send") ||
        (lbl.name === "navigator.sendBeacon()") ||
        (lbl.name === "[Element][p]" && lbl.extra[1] === "src") ||
        (lbl.name === "[Element].setAttribute()" && lbl.extra[1] === "src")
    );
}

function isLabelRelatedToLocation(lbl) {
    return lbl.name === "location";
}

function isLabelRelatedToNavigator(lbl) {
    return lbl.name === "navigator[p]" && (
        lbl.extra[0] === "geolocation" ||
        lbl.extra[0] === "language" ||
        lbl.extra[0] === "userAgent" ||
        lbl.extra[0] === "platform"
    );
}

function labels(flow) {
    return [...flow[0], flow[1]];
}

function relatedLabels(flow, isSourceLabelRelatedTo, isSinkLabelRelatedTo) {
    return [
        ...flow[0].filter(lbl => isSourceLabelRelatedTo(lbl)),
        ...(isSinkLabelRelatedTo(flow[1]) ? [flow[1]] : [])
    ];
}

function labelsRelatedTo(flow, what) {
    return relatedLabels(
        flow,
        lbl => isSourceLabelRelatedTo(lbl, what),
        lbl => isSinkLabelRelatedTo(lbl, what)
    );
}

function srcByNetworkLabel(lbl) {
    if (lbl.name === "[XMLHttpRequest].response") {
        return lbl.extra[1];
    } else if (lbl.name === "[XMLHttpRequest][f]()" && lbl.extra[2] === "send") {
        return lbl.extra[1];
    } else if (lbl.name === "navigator.sendBeacon()") {
        return lbl.extra[0];
    } else if (lbl.name === "[Element][p]" && lbl.extra[1] === "src") {
        return lbl.extra[2];
    } else if (lbl.name === "[Element].setAttribute()" && lbl.extra[1] === "src") {
        return lbl.extra[2];
    } else {
        throw new Error("Network label expected, but got other.");
    }
}

function srcUrlByNetworkLabel(lbl, documentOrigin) {
    const addProtocolToUrlIfMissing = url =>
        /^\/\//.test(url)
        ? (new URL(documentOrigin)).protocol + url
        : url;
    return new URL(
        addProtocolToUrlIfMissing(
            srcByNetworkLabel(lbl)),
        documentOrigin
    );
}

export {
    isSourceLabel,
    isSinkLabel,
    isSourceLabelRelatedTo,
    isSinkLabelRelatedTo,
    isSourceLabelRelatedToStorage,
    isSinkLabelRelatedToStorage,
    isLabelRelatedToCookies,
    isSourceLabelRelatedToNetwork,
    isSinkLabelRelatedToNetwork,
    isLabelRelatedToLocation,
    isLabelRelatedToNavigator,
    labels,
    labelsRelatedTo,
    srcUrlByNetworkLabel
};
