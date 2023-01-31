"use strict";

import {
    prefilter,
    parseUrls,
    throwAway
} from "./lib/clean.js";
import LineByLine from "n-readlines";
import { labels } from "./lib/labels.js";

function readAllLinesFromFile(filename) {
    const data = [];
    const lineReader = new LineByLine(filename);
    let lineBuffer;
    while (lineBuffer = lineReader.next()) {
        const line = lineBuffer.toString();
        if (line) data.push(line);
    }
    return data;
}

function readDataFromFile(filename) {
    return readAllLinesFromFile(filename)
        .map(line => JSON.parse(line));
}

function removeSubstring(str, startIndex, endIndex) {
    return str.substring(0, startIndex) + str.substring(endIndex);
}

function removeTimestamps(str) {
    const analysisTS = new Date(2022, 4, 18).valueOf();
    const oneYearTS = 31536000000;
    const fromTS = new Date(analysisTS - oneYearTS).valueOf();
    const toTS = new Date(analysisTS + oneYearTS).valueOf();
    const re = /([0-9]+)/g;
    return [...str.matchAll(re)]
        .filter((result) => {
            const value = parseInt(result[1]);
            return value >= fromTS && value <= toTS;
        })
        .reduce((str, result) => removeSubstring(str, result.index, result.index + result[1].length), str);
}

function longestCommonSubstring(str1, str2) {
    let s1 = -1, s2 = -1, len = 0;
    for (let i = 0, l = 0; i < str1.length; i += l > 0 ? l : 1) {
        for (let j = 0; i + l < str1.length && j < str2.length; j += 1) {
            if (str1[i + l] === str2[j]) {
                l += 1;
                if (l > len) {
                    len = l;
                    s1 = i;
                    s2 = j - l + 1;
                }
            } else {
                l = 0;
            }
        }
    }
    return [s1, s2, len];
}

(() => {

    if (process.argv.length !== 3) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <wkdir>`);
        return;
    }

    const wkdir = process.argv[2];

    const data =
        throwAway(
            parseUrls(
                prefilter(
                    readDataFromFile(wkdir + "/output.txt")
                )));

    const top10ScriptUrls = [
        "https://static.chartbeat.com/js/chartbeat.js",
        "https://mc.yandex.ru/metrika/tag.js",
        "https://quantcast.mgr.consensu.org/tcfv2/cmp2.js",
        "https://fast.wistia.com/assets/external/E-v1.js",
        "https://cdn.pdst.fm/ping.min.js",
        "https://bat.bing.com/bat.js",
        "https://mc.yandex.ru/metrika/watch.js",
        "https://sdk.privacy-center.org/sdk.3ceecd59a5d22ab8184862f0456f7f817f806909.js",
        "https://cdn.cxense.com/cx.js",
        "https://az416426.vo.msecnd.net/scripts/a/ai.0.js",
    ];

    console.log(
        data.filter(site =>
            site.flows
                .some(flow =>
                    labels(flow)
                        .some(lbl =>
                            lbl.scriptUrl &&
                            top10ScriptUrls.includes(lbl.scriptUrl.href)
                        )
                )
            )
            .length
    );

})();
