"use strict";

import { labelsRelatedTo } from "./labels.js";
import { countFlows } from "./count.js";

function countNetworkFlowsWithHttp(data, secure) {
    return countFlows(data, flow =>
        labelsRelatedTo(flow, "network")
            .some(lbl => lbl.srcUrl.protocol === (secure ? "https:" : "http:"))
    );
}

export {
    countNetworkFlowsWithHttp
};
