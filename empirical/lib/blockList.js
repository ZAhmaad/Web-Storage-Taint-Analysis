"use strict";

import * as fs from "fs";
import RE2 from "re2";
import { inject } from "./di.js";

function makeBlockList(blockListFile) {
    return new BlockList(
        JSON.parse(fs.readFileSync(blockListFile).toString())
            .filter(rule =>
                rule.action["type"] === "block" ||
                rule.action["type"] === "ignore-previous-rules"
            )
            .filter(rule =>
                rule.trigger["resource-type"] === undefined ||
                rule.trigger["resource-type"].includes("script")
            )
            .map(rule => ({
                actionType: rule.action.type,
                urlFilter: new RE2(
                    rule.trigger["url-filter"],
                    rule.trigger["url-filter-is-case-sensitive"] ? "" : "i"
                ),
                firstParty: (
                    rule.trigger["load-type"] === undefined ||
                    rule.trigger["load-type"].includes("first-party")
                ),
                thirdParty: (
                    rule.trigger["load-type"] === undefined ||
                    rule.trigger["load-type"].includes("third-party")
                ),
                ifDomain: rule.trigger["if-domain"] &&
                    rule.trigger["if-domain"]
                        .map(domain => domain.substring(1)),
                unlessDomain: rule.trigger["unless-domain"] &&
                    rule.trigger["unless-domain"]
                        .map(domain => domain.substring(1))
            }))
    );
}

class BlockList {

    constructor(blockList) {
        this.blockList = blockList;
    }

    doesUrlTriggerBlockRule(rule, scriptUrl, scriptOrigin, scriptDomain, documentOrigin) {
        return (
            (rule.firstParty && rule.thirdParty) ||
            (scriptOrigin === documentOrigin ? rule.firstParty : rule.thirdParty)
        ) && (
            !rule.ifDomain ||
            rule.ifDomain.includes(scriptDomain)
        ) && (
            !rule.unlessDomain ||
            !rule.unlessDomain.includes(scriptDomain)
        ) && rule.urlFilter.test(scriptUrl);
    }

    isBlockedUrl(scriptUrl, documentOrigin) {
        const domainParser = inject("domainParser");
        const scriptURL = new URL(scriptUrl);
        const scriptOrigin = scriptURL.origin;
        const scriptDomain = domainParser.domainByHostname(scriptURL.hostname);
        return this.blockList
            .reduce((blocked, rule) => {
                if (blocked) {
                    return !(
                        rule.actionType === "ignore-previous-rules" &&
                        this.doesUrlTriggerBlockRule(rule, scriptUrl, scriptOrigin, scriptDomain, documentOrigin)
                    );
                } else {
                    return (
                        rule.actionType === "block" &&
                        this.doesUrlTriggerBlockRule(rule, scriptUrl, scriptOrigin, scriptDomain, documentOrigin)
                    );
                }
            }, false);
    }
}

export {
    makeBlockList
};
