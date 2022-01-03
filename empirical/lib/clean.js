"use strict";

import {
    isSinkLabel,
    isSinkLabelRelatedToNetwork,
    isSinkLabelRelatedToStorage,
    isSourceLabel,
    isSourceLabelRelatedToNetwork,
    isSourceLabelRelatedToStorage,
    srcUrlByNetworkLabel
} from "./labels.js";

function prefilter(data) {
    return data
        .map(site => ({
            ...site,
            flows: site.flows
                .filter(flow => isSinkLabel(flow[1]))
                .map(flow => [
                    flow[0].filter(lbl => isSourceLabel(lbl)),
                    flow[1]
                ])
                .filter(flow => flow[0].length > 0)
        }))
        .filter(site => site.flows.length > 0);
}

function parseUrls(data) {
    return data
        .map(site => {
            const documentUrl = new URL(site.url);
            const parseUrlsInLabel = (lbl, sourceLabel) => ({
                ...lbl,
                scriptUrl: lbl.scriptUrl && new URL(lbl.scriptUrl),
                srcUrl: (
                    (sourceLabel ? isSourceLabelRelatedToNetwork(lbl) : isSinkLabelRelatedToNetwork(lbl))
                    ? srcUrlByNetworkLabel(lbl, documentUrl.origin)
                    : undefined
                )
            });
            return {
                url: documentUrl,
                flows: site.flows
                    .map(flow => [
                        flow[0].map(lbl => parseUrlsInLabel(lbl, true)),
                        parseUrlsInLabel(flow[1], false)
                    ])
                };
        });
}

function throwAway(data) {
    return data
        .map(site => ({
            ...site,
            flows: site.flows
                .map(flow => [
                    isSinkLabelRelatedToStorage(flow[1])
                    ? flow[0].filter(lbl => !isSourceLabelRelatedToStorage(lbl))
                    : flow[0],
                    flow[1]
                ])
                .filter(flow => flow[0].length > 0)
            }))
        .filter(site => site.flows.length > 0);
}

export {
    prefilter,
    parseUrls,
    throwAway
};
