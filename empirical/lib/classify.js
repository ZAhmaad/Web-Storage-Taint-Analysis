"use strict";

import {
    isSourceLabelRelatedTo,
    isSinkLabelRelatedTo,
    labels,
    labelsRelatedTo,
    urlByNetworkLabel
} from "./labels.js";
import { inject } from "./di.js";

function classifyMayViolateConfidentiality(flow) {
    return flow[0].some(lbl => isSourceLabelRelatedTo(lbl, "storage"));
}

function classifyMayViolateIntegrity(flow) {
    return isSinkLabelRelatedTo(flow[1], "storage");
}

function classifyExternal(flow, documentOrigin) {
    const isLabelExternal = (lbl, isSourceLabel) => ((
            isSourceLabel
            ? isSourceLabelRelatedTo(lbl, "network")
            : isSinkLabelRelatedTo(lbl, "network")
        ) && (
            (new URL(urlByNetworkLabel(lbl, documentOrigin), documentOrigin)).origin !== documentOrigin
    ));

    if (classifyMayViolateConfidentiality(flow)) {
        return isLabelExternal(flow[1], false);
    } else {
        return flow[0].some(lbl => isLabelExternal(lbl, true));
    }
}

function classifyInternal(flow, documentOrigin) {
    return !classifyExternal(flow, documentOrigin);
}

function classifyTracking(flow, documentOrigin) {
    const isKnownTrackingScript = inject("tracking");
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

function classifySameSite(flow, documentOrigin, documentDomain) {
    const domainParser = inject("domainParser");
    return labelsRelatedTo(flow, "network")
        .every(lbl =>
            domainParser.domainByHostname(
                new URL(urlByNetworkLabel(lbl, documentOrigin)).hostname) === documentDomain);
}

function classify(data) {
    const domainParser = inject("domainParser");
    return data
        .map(site => {
            const documentURL = new URL(site.url);
            const documentOrigin = documentURL.origin;
            const documentDomain = domainParser.domainByHostname(documentURL.hostname);
            return {
                url: site.url,
                flows: site.flows
                    .map(flow => ({
                        original: flow,
                        mayViolateConfidentiality: classifyMayViolateConfidentiality(flow),
                        mayViolateIntegrity: classifyMayViolateIntegrity(flow),
                        internal: classifyInternal(flow, documentOrigin),
                        tracking: classifyTracking(flow, documentOrigin),
                        local: classifyLocal(flow),
                        session: classifySession(flow),
                    }))
                    .map(flow => {
                        return {
                            ...flow,
                            sameSite: !flow.internal && (classifySameSite(flow.original, documentOrigin, documentDomain))
                        };
                    })
            };
        });
}

export {
    classify
};
