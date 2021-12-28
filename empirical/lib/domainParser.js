"use strict";

import PublicSuffixList from "publicsuffixlist";

function makeDomainParser() {
    const psl = new PublicSuffixList();
    psl.initializeSync();
    return new DomainParser(psl);
}

class DomainParser {

    constructor(psl) {
        this.psl = psl;
    }

    domainByHostname(hostname) {
        return this.psl.domain(hostname);
    }
}

export {
    makeDomainParser
};
