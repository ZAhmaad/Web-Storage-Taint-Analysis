"use strict";

import {
    labels,
    labelsRelatedTo
} from "./labels.js";
import { countFlows } from "./report.js";
import { inject } from "./di.js";

function isTrackingLib(data, scriptUrl) {
    return data
        .some(site => {
            const isKnownTrackingScript = inject("trackingWithCache")(new Map());
            return site.flows
                .some(flow =>
                    labels(flow)
                        .some(lbl =>
                            lbl.scriptUrl &&
                            lbl.scriptUrl.href === scriptUrl.href &&
                            isKnownTrackingScript(scriptUrl, site.url.origin)
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
                            .filter(lbl => lbl.scriptUrl)
                            .map(lbl => lbl.scriptUrl.href)
                    )
            )]
        );
    const popularityMap = new Map();
    scriptGroups.forEach(group => {
        group.forEach(href => {
            popularityMap.set(href, (popularityMap.get(href) || 0) + 1);
        });
    });
    return [...popularityMap]
        .filter(e => e[1] > 1)
        .sort((a, b) => a[1] < b[1] ? 1 : (a[1] > b[1] ? -1 : 0))
        .map(e => ({
            scriptHref: e[0],
            flowsCount: countFlows(data, flow =>
                labelsRelatedTo(flow, "storage")
                    .some(lbl => lbl.scriptUrl && lbl.scriptUrl.href === e[0])
            ),
            sitesCount: e[1],
            trackingLib: isTrackingLib(data, new URL(e[0]))
        }));
}

export {
    rankLibUsage
};
