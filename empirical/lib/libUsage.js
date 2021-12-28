"use strict";

import { labels, labelsRelatedTo } from "./labels.js";
import { countFlows } from "./report.js";
import { inject } from "./di.js";

function isTrackingLib(data, scriptUrl) {
    const isKnownTrackingScript = inject("tracking");
    return data
        .some(site => {
            const documentURL = new URL(site.url);
            const documentOrigin = documentURL.origin;
            return site.flows
                .some(flow =>
                    labels(flow)
                        .some(lbl =>
                            lbl.scriptUrl &&
                            lbl.scriptUrl === scriptUrl &&
                            isKnownTrackingScript(scriptUrl, documentOrigin)
                        )
                )
        });
}

function rankLibUsage(data) {
    const scriptGroups = data
        .map(site =>
            [...new Set(
                site.flows
                    .flatMap(flow =>
                        labelsRelatedTo(flow, "storage")
                            .map(lbl => lbl.scriptUrl)
                            .filter(script => script)
                    )
            )]
        );
    const popularityMap = new Map();
    scriptGroups.forEach(group => {
        group.forEach(script => {
            popularityMap.set(script, (popularityMap.get(script) || 0) + 1);
        });
    });
    return [...popularityMap]
        .filter(e => e[1] > 1)
        .sort((a, b) => a[1] < b[1] ? 1 : (a[1] > b[1] ? -1 : 0))
        .map(e => ({
            scriptUrl: e[0],
            flowsCount: countFlows(data, flow =>
                labelsRelatedTo(flow, "storage")
                    .some(lbl => lbl.scriptUrl && lbl.scriptUrl === e[0])
            ),
            sitesCount: e[1],
            trackingLib: isTrackingLib(data, e[0])
        }));
}

export {
    rankLibUsage
};
