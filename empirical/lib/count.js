"use strict";

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

export {
    countFlows,
    countSites
};
