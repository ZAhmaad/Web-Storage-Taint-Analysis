"use strict";

import {
    isSourceLabelRelatedTo,
    isSinkLabelRelatedTo
} from "./labels.js";

function countFlows(data, filterFn) {
    return data
        .map(site => site.flows.filter(flow => filterFn(flow)).length)
        .reduce((acc, cur) => acc + cur, 0);
}

function countSites(data, filterFn) {
    return data
        .filter(site => site.flows.filter(flow => filterFn(flow)).length > 0)
        .length;
}

function makeTable2Html(data) {
    const dim1 = [
        ["Confid", (flow, what) => flow.mayViolateConfidentiality && isSinkLabelRelatedTo(flow.original[1], what)],
        ["Integr", (flow, what) => flow.mayViolateIntegrity && flow.original[0].some(lbl => isSourceLabelRelatedTo(lbl, what))],
    ];
    const dim2 = [
        ["Cookies", "cookies"],
        ["Location", "location"],
        ["Navigator", "navigator"],
        ["Network", "network"],
    ];

    const table = new Array(dim1.length);
    for (let row = 0; row < dim1.length; ++row) {
        const tableRow = new Array(dim2.length);
        for (let col = 0; col < dim2.length; ++col) {
            const filterFn = flow => dim1[row][1](flow, dim2[col][1]);
            const flowsCount = countFlows(data, filterFn);
            const sitesCount = countSites(data, filterFn);
            tableRow[col] = `${flowsCount} / ${sitesCount}`;
        }
        table[row] = tableRow;
    }

    return "<table>"
        + "<tr><th></th>" + dim2.map(dim => `<th>${dim[0]}</th>`).join("") + "</tr>"
        + table.map((tableRow, row) => "<tr>" + `<th>${dim1[row][0]}</th>` + tableRow.map(tableData => `<td>${tableData}</td>`).join("") + "</tr>").join("")
        + "</table>";
}

function makeTable3Html(data) {
    const dims = [
        [1, "Confid", flow => flow.mayViolateConfidentiality],
        [1, "Integr", flow => flow.mayViolateIntegrity],
        [2, "Int", flow => flow.internal],
        [2, "Ext", flow => !flow.internal],
        [3, "Trk", flow => flow.tracking],
        [3, "NonTrk", flow => !flow.tracking],
        [5, "Local", flow => flow.local && !flow.session],
        [5, "Session", flow => !flow.local && flow.session],
        [5, "Both", flow => flow.local && flow.session],
    ];

    const table = new Array(dims.length);
    for (let row = 0; row < dims.length; ++row) {
        const tableRow = new Array(dims.length);
        const condition = countFlows(data, flow => dims[row][2](flow));
        for (let col = 0; col < dims.length; ++col) {
            if (dims[row][0] !== dims[col][0]) {
                const intersection = countFlows(data, flow => dims[row][2](flow) && dims[col][2](flow));
                tableRow[col] = `${intersection} (${(intersection * 100 / condition).toFixed(1)}%)`;
            } else {
                tableRow[col] = "";
            }
        }
        table[row] = tableRow;
    }

    return "<table>"
        + "<tr><th></th>" + dims.map(dim => `<th>${dim[1]}</th>`).join("") + "</tr>"
        + table.map((tableRow, row) => "<tr>" + `<th>${dims[row][1]}</th>` + tableRow.map(tableData => `<td>${tableData}</td>`).join("") + "</tr>").join("")
        + "</table>";
}

function makeTable4Html(data) {
    const dim1 = [
        ["Confid", flow => flow.mayViolateConfidentiality],
        ["Integr", flow => flow.mayViolateIntegrity],
        ["Trk", flow => flow.tracking],
        ["NonTrk", flow => !flow.tracking],
        ["Local", flow => flow.local && !flow.session],
        ["Session", flow => !flow.local && flow.session],
        ["Both", flow => flow.local && flow.session],
    ];
    const dim2 = [
        ["SameSite", flow => flow.sameSite],
        ["CrossSite", flow => !flow.sameSite],
    ];

    const table = new Array(dim1.length);
    for (let row = 0; row < dim1.length; ++row) {
        const tableRow = new Array(dim2.length);
        for (let col = 0; col < dim2.length; ++col) {
            const flowsCount = countFlows(data, flow => !flow.internal && dim1[row][1](flow) && dim2[col][1](flow));
            tableRow[col] = `${flowsCount}`;
        }
        table[row] = tableRow;
    }

    return "<table>"
        + "<tr><th></th>" + dim2.map(dim => `<th>${dim[0]}</th>`).join("") + "</tr>"
        + table.map((tableRow, row) => "<tr>" + `<th>${dim1[row][0]}</th>` + tableRow.map(tableData => `<td>${tableData}</td>`).join("") + "</tr>").join("")
        + "</table>";
}

function makeLibUsageRankingListHtml(libUsageRankingList) {
    return "<ol>"
        + libUsageRankingList
            .map(e => `<li>${e.scriptUrl} (${e.flowsCount} / ${e.sitesCount}) [${e.trackingLib ? "TRACKING" : "NON-TRACKING"}]</li>`)
            .join("")
        + "</ol>";
}

function makeStatsHtml(data1, data2) {
    return "<div>"
        + `<p># total flows: ${countFlows(data1, () => true)}</p>`
        + `<p># total sites: ${countSites(data1, () => true)}</p>`
        + `<p># total flows after throwAway: ${countFlows(data2, () => true)}</p>`
        + `<p># total sites after throwAway: ${countSites(data2, () => true)}</p>`
        + "</div>";
}

function fillReport(statsHtml, table2Html, table3Html, table4Html, libUsageRankingListHtml) {
    return `<!doctype html>
<html>
<head>
<style>table, th, td { border-collapse: collapse; border: solid 1px black; padding: 8px }</style>
</head>
<body>
${statsHtml}
${table2Html}
${table3Html}
${table4Html}
${libUsageRankingListHtml}
</body>
</html>
`;
}

export {
    countFlows,
    countSites,
    makeTable2Html,
    makeTable3Html,
    makeTable4Html,
    makeLibUsageRankingListHtml,
    makeStatsHtml,
    fillReport
};
