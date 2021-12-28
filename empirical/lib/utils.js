"use strict";

function addProtocolToUrl(scriptUrl, documentOrigin) {
    if (/^\/\//.test(scriptUrl)) {
        return (new URL(documentOrigin)).protocol + scriptUrl;
    } else {
        return scriptUrl;
    }
}

export {
    addProtocolToUrl
};
