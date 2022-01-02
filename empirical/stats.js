"use strict";

import * as fs from "fs";
const fsPromises = fs.promises;

(async () => {

    if (process.argv.length !== 3) {
        console.log(`Usage: ${process.argv[0]} ${process.argv[1]} <dataset-filename>`);
        return;
    }

    const dataFilename = process.argv[2];

    const data = JSON.parse((await fsPromises.readFile(dataFilename)).toString());

    const numSites = data.length;
    const numWsSites = data.filter(site => site.wsIidsInGrep > 0).length;
    const numWsJaSites = data.filter(site => site.wsIidsInAnalysis > 0).length;
    const numWsJaNESites = data.filter(site => site.flows.some(flow => flow[0].length > 0)).length;

    console.log("# sites", numSites);
    console.log("# sites using WS", numWsSites);
    console.log("# sites with flow by Jalangi", numWsJaSites);
    console.log("# sites with flow by Jalangi (non-empty label set)", numWsJaNESites);

    const totalFalseNegatives = data.reduce((sum, site) => sum + (site.wsIidsInGrep - site.wsIidsInAnalysis), 0);
    const totalWsIids = data.reduce((sum, site) => sum + site.wsIidsInGrep, 0);

    console.log("% false negatives", totalFalseNegatives / totalWsIids * 100);

})();
