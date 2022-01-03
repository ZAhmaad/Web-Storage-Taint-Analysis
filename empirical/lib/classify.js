"use strict";

import {
    isSourceLabelRelatedToStorage,
    isSinkLabelRelatedToStorage,
    isSourceLabelRelatedToNetwork,
    isSinkLabelRelatedToNetwork,
    labels,
    labelsRelatedTo
} from "./labels.js";
import { inject } from "./di.js";

function classifyMayViolateConfidentiality(flow) {
    return flow[0].some(lbl => isSourceLabelRelatedToStorage(lbl));
}

function classifyMayViolateIntegrity(flow) {
    return isSinkLabelRelatedToStorage(flow[1]);
}

function classifyExternal(flow, documentOrigin) {
    const isExternalLabel = (lbl, sourceLabel) =>
        (sourceLabel ? isSourceLabelRelatedToNetwork(lbl) : isSinkLabelRelatedToNetwork(lbl))
        ? lbl.srcUrl.origin !== documentOrigin
        : false;
    if (classifyMayViolateConfidentiality(flow)) {
        return isExternalLabel(flow[1], false);
    } else {
        return flow[0].some(lbl => isExternalLabel(lbl, true));
    }
}

function classifyInternal(flow, documentOrigin) {
    return !classifyExternal(flow, documentOrigin);
}

function classifyTracking(flow, documentOrigin, isKnownTrackingScript) {
    return labels(flow)
        .some(lbl => lbl.scriptUrl && isKnownTrackingScript(lbl.scriptUrl, documentOrigin));
}

function classifyLocal(flow) {
    return labelsRelatedTo(flow, "storage")
        .some(lbl => lbl.extra[0] === "localStorage");
}

function classifySession(flow) {
    return labelsRelatedTo(flow, "storage")
        .some(lbl => lbl.extra[0] === "sessionStorage");
}

function classifySameSite(flow, documentDomain) {
    const domainParser = inject("domainParser");
    return labelsRelatedTo(flow, "network")
        .every(lbl =>
            domainParser.domainByHostname(lbl.srcUrl.hostname) === documentDomain);
}

function classify(data) {
    const domainParser = inject("domainParser");
    return data
        .map((site, siteIndex) => {
            console.log(`classifying ${siteIndex + 1} / ${data.length}`);
            const documentOrigin = site.url.origin;
            const documentDomain = domainParser.domainByHostname(site.url.hostname);
            const isKnownTrackingScript = inject("trackingWithCache")(new Map());
            return {
                url: site.url,
                flows: site.flows
                    .map(flow => ({
                        original: flow,
                        mayViolateConfidentiality: classifyMayViolateConfidentiality(flow),
                        mayViolateIntegrity: classifyMayViolateIntegrity(flow),
                        internal: classifyInternal(flow, documentOrigin),
                        tracking: classifyTracking(flow, documentOrigin, isKnownTrackingScript),
                        local: classifyLocal(flow),
                        session: classifySession(flow),
                    }))
                    .map(flow => {
                        return {
                            ...flow,
                            sameSite: !flow.internal && classifySameSite(flow.original, documentDomain)
                        };
                    })
            };
        });
}

export {
    classify
};
