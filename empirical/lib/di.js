"use strict";

import { makeBlockList } from "./blockList.js";
import { makeDomainParser } from "./domainParser.js";

const factories = new Map([
    ["domainParser", () => makeDomainParser()],
    ["easyList", () => makeBlockList("easylist.block.txt")],
    ["easyPrivacy", () => makeBlockList("easyprivacy.block.txt")],
    ["tracking", () => {
        const easyList = inject("easyList");
        const easyPrivacy = inject("easyPrivacy");
        return (scriptUrl, documentOrigin) =>
            easyList.isBlockedUrl(scriptUrl, documentOrigin) ||
            easyPrivacy.isBlockedUrl(scriptUrl, documentOrigin);
    }],
    ["trackingWithCache", () => {
        const isKnownTrackingScript = inject("tracking");
        return cache => (scriptUrl, documentOrigin) => {
            if (scriptUrl) {
                if (cache.has(scriptUrl.href)) {
                    return cache.get(scriptUrl.href);
                } else {
                    const result = isKnownTrackingScript(scriptUrl, documentOrigin);
                    cache.set(scriptUrl.href, result);
                    return result;
                }
            } else {
                return false;
            }
        };
    }]
]);

const container = new Map();

function inject(name) {
    if (container.has(name)) {
        return container.get(name);
    } else if (factories.has(name)) {
        const svc = factories.get(name)();
        container.set(name, svc);
        return svc;
    } else {
        throw new Error("Service not found.");
    }
}

export {
    inject
};
