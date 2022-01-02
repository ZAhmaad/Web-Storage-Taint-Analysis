"use strict";

import * as fs from "fs";
import { classify } from "./lib/classify.js";
import { rankLibUsage } from "./lib/libUsage.js";
import {
    isSourceLabel,
    isSinkLabel,
    isSourceLabelRelatedTo,
    isSinkLabelRelatedTo
} from "./lib/labels.js";
import {
    makeTable2Html,
    makeTable3Html,
    makeTable4Html,
    makeLibUsageRankingListHtml,
    makeStatsHtml,
    fillReport
} from "./lib/report.js";

(() => {

    function throwAwayStorageToStorageFlows(data) {
        return data
            .map(site => ({
                ...site,
                flows: site.flows
                    .map(flow => [
                        isSinkLabelRelatedTo(flow[1], "storage")
                        ? flow[0].filter(lbl => !isSourceLabelRelatedTo(lbl, "storage"))
                        : flow[0],
                        flow[1]
                    ])
                    .filter(flow => flow[0].length > 0)
                }))
            .filter(site => site.flows.length > 0);
    }

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

    if (process.argv.length !== 3) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <wkdir>`);
        return;
    }

    const wkdir = process.argv[2];

    const data1 = prefilter(
        JSON.parse(fs.readFileSync(wkdir + "/output.txt").toString())
    );
    const classified1 = classify(data1);
    const data2 = throwAwayStorageToStorageFlows(data1);
    const classified2 = classify(data2);

    const table2Html = makeTable2Html(classified1);
    const table3Html = makeTable3Html(classified2);
    const table4Html = makeTable4Html(classified2);

    const libUsageRankingList = rankLibUsage(data1);
    const libUsageRankingListHtml = makeLibUsageRankingListHtml(libUsageRankingList);

    const statsHtml = makeStatsHtml(data1, data2);

    const report = fillReport(statsHtml, table2Html, table3Html, table4Html, libUsageRankingListHtml);
    fs.writeFileSync(wkdir + "/report.html", report);

})();
