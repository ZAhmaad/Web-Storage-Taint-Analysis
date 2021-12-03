"use strict";

const fs = require("fs");
const fsPromises = fs.promises;

(async () => {

    function labelEquals(lbl1, lbl2) {
        return (
            lbl1.name === lbl2.name &&
            lbl1.iid === lbl2.iid &&
            lbl1.sid === lbl2.sid &&
            lbl1.extra.length === lbl2.extra.length &&
            lbl1.extra.every((e, i) => lbl2.extra[i] === e)
        );
    };

    function taintEquals(t1, t2) {
        return (
            t1.labelSet.length === t2.labelSet.length &&
            t1.labelSet.every(lbl1 => t2.labelSet.some(lbl2 => labelEquals(lbl1, lbl2)))
        );
    }

    function filterDistinctFlows(flows) {
        return flows.filter((flow1, i1) =>
            !flows.some((flow2, i2) => i2 < i1 && taintEquals(flow1[0], flow2[0]) && labelEquals(flow1[1], flow2[1]))
        );
    }

    function filterBrokenFlows(flows) {
        return flows.filter(flow =>
            [...flow[0].labelSet, flow[1]].some(lbl => lbl.sid !== undefined)
        );
    }

    function getRidByLocation(location) {
        const re = /jalproxy-[A-Za-z0-9]*(?:\/|\\\\)([a-z0-9]{8}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12})(?:\/|\\\\)orig\.js/;
        const result = location.match(re);
        return (result && result[1]);
    }

    function putSidToScriptUrlMap(sid2ScriptUrlMap, sid, scriptUrl) {
        if (sid2ScriptUrlMap.has(sid)) {
            if (sid2ScriptUrlMap.get(sid) !== scriptUrl) {
                throw new Error("Inconsistent mapping: sid -> scriptUrl");
            }
        } else {
            sid2ScriptUrlMap.set(sid, scriptUrl);
        }
    }

    function getSidToScriptUrlMap(flows) {
        const sid2ScriptUrlMap = new Map();
        for (let flow of flows) {
            for (let lbl of [...flow[0].labelSet, flow[1]]) {
                const rid = getRidByLocation(lbl.location);
                const scriptUrl = rid && (rid2UrlMap.get(rid) || null);
                putSidToScriptUrlMap(sid2ScriptUrlMap, lbl.sid, scriptUrl);
            }
        }
        return sid2ScriptUrlMap;
    }

    function LabelClass(params) {
        if (params.iid) {
            this.iid = params.iid;
            this.sid = params.sid;
        }
        if (params.scriptUrl) {
            this.scriptUrl = params.scriptUrl;
        }
        if (params.grepString) {
            this.grepString = params.grepString;
        }
        this.labels = [];
    }

    LabelClass.prototype.match = function (lbl) {
        if (this.iid) {
            if (this.iid !== lbl.iid || this.sid !== lbl.sid) {
                return false;
            }
        }
        if (this.scriptUrl) {
            if (lbl.scriptUrl && this.scriptUrl !== lbl.scriptUrl) {
                return false;
            }
        }
        if (this.grepString) {
            if (!this.grepString.includes("J$.M(" + lbl.iid)) {
                return false;
            }
        }
        return true;
    }

    LabelClass.prototype.addLabel = function (lbl) {
        if (!this.iid) {
            this.iid = lbl.iid;
            this.sid = lbl.sid;
        }
        if (!this.scriptUrl) {
            if (lbl.scriptUrl) {
                this.scriptUrl = lbl.scriptUrl;
            }
        }
        this.labels.push(lbl);
        if (this.iid && lbl.iid && this.scriptUrl && lbl.scriptUrl) {
            if (this.sid === lbl.sid && this.scriptUrl !== lbl.scriptUrl) {
                throw new Error("Inconsistent mapping: sid -> scriptUrl");
            }
        }
    }

    function classifyLabel(lbl, lblClasses) {
        const lblClass = lblClasses.find(lblClass => lblClass.match(lbl))
            || lblClasses[lblClasses.push(new LabelClass({ iid: lbl.iid, sid: lbl.sid })) - 1];
        lblClass.addLabel(lbl);
    }

    function processSite(site) {
        const distinctFlows = filterBrokenFlows(filterDistinctFlows(site.flows));

        const sid2ScriptUrlMap = getSidToScriptUrlMap(distinctFlows);

        const toFinalLabel = (lbl) => ({
            name: lbl.name,
            iid: lbl.iid,
            sid: lbl.sid,
            scriptUrl: sid2ScriptUrlMap.get(lbl.sid) || null,
            extra: lbl.extra
        });

        const finalFlows = distinctFlows
            .map(flow => [
                flow[0].labelSet.map(lbl => toFinalLabel(lbl)),
                toFinalLabel(flow[1])
            ]);

        const lblClasses = site.grepResult
            .flatMap(grepSet =>
                grepSet[1]
                    .filter(grepString => grepString.substring(101, 108) === "setItem")
                    .filter(grepString => grepString.substring(0, 100).includes("J$.M("))
                    .map(grepString => new LabelClass({ scriptUrl: grepSet[0], grepString }))
            );

        finalFlows
            .flatMap(flow => [...flow[0], flow[1]])
            .filter(lbl => lbl.name.startsWith("[Storage]"))
            .forEach(lbl => { classifyLabel(lbl, lblClasses); });

        const wsIidsInGrep = lblClasses.length;
        const wsIidsInAnalysis = lblClasses.filter(lblClass => lblClass.labels.length > 0).length;

        return {
            url: site.url,
            flows: finalFlows,
            wsIidsInGrep,
            wsIidsInAnalysis
        };
    }

    async function getDataFromFile(filename) {
        return (await fsPromises.readFile(filename))
            .toString()
            .split("\n")
            .filter(line => line)
            .map(line => JSON.parse(line));
    }

    async function getRidToUrlMapFromFile(filename) {
        const entries = (await fsPromises.readFile(filename))
            .toString()
            .split("\n")
            .filter(line => line)
            .map(line => line.split(": "));
        const rid2UrlMap = new Map();
        for (let entry of entries) {
            rid2UrlMap.set(entry[0], entry[1]);
        }
        return rid2UrlMap;
    }

    if (process.argv.length !== 5) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <data-filename> <logs-filename> <output-filename>`);
        return;
    }

    const dataFilename = process.argv[2];

    const logsFilename = process.argv[3];

    const outputFilename = process.argv[4];

    const data = await getDataFromFile(dataFilename);

    const rid2UrlMap = await getRidToUrlMapFromFile(logsFilename);

    const result = data.map(site => processSite(site));

    await fsPromises.writeFile(outputFilename, JSON.stringify(result));

})();
