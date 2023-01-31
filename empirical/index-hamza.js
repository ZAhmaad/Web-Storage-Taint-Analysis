"use strict";

import * as fs from "fs";
import {
  prefilter,
  parseUrls,
  throwAway
} from "./lib/clean.js";
import { classify } from "./lib/classify.js";

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
          JSON.parse(fs.readFileSync(wkdir + "/output0.txt").toString())
        )));

  const secondaryData =
    throwAway(
      parseUrls(
        prefilter(
          JSON.parse(fs.readFileSync(wkdir + "/output1.txt").toString())
        )));

  const classified = classify(data, secondaryData);

  function measure(measurementFn) {
    return classified.reduce(
      (flowsCount, site) =>
        flowsCount + site.flows.filter((flow) => measurementFn(flow)).length,
      0
    );
  }

  console.log('!T & !H', measure(flow => !flow.tracking && !flow.trackingHamza));
  console.log('!T & H', measure(flow => !flow.tracking && flow.trackingHamza));
  console.log('T & !H', measure(flow => flow.tracking && !flow.trackingHamza));
  console.log('T & H', measure(flow => flow.tracking && flow.trackingHamza));
  console.log('total', measure(flow => true));

  function setUnion(as, bs) {
    return new Set([...as, ...bs]);
  }

  function setIntersection(as, bs) {
    return new Set(
      [...as].filter(a => bs.has(a))
    );
  }

  function setDifference(as, bs) {
    return new Set(
      [...as].filter(a => !bs.has(a))
    );
  }

  let trackingScriptUrls = new Set();
  let trackingHamzaScriptUrls = new Set();
  let scriptUrls = new Set();
  for (let site of classified) {
    for (let flow of site.flows) {
      trackingScriptUrls = setUnion(trackingScriptUrls, flow.trackingScriptUrls);
      trackingHamzaScriptUrls = setUnion(trackingHamzaScriptUrls, flow.trackingHamzaScriptUrls);
      scriptUrls = setUnion(scriptUrls, flow.scriptUrls);
    }
  }
  let nonTrackingScriptUrls = setDifference(scriptUrls, trackingScriptUrls);
  let nonTrackingHamzaScriptUrls = setDifference(scriptUrls, trackingHamzaScriptUrls);

  console.log('!T & !H', [...setIntersection(nonTrackingScriptUrls, nonTrackingHamzaScriptUrls)].length);
  console.log('!T & H', [...setIntersection(nonTrackingScriptUrls, trackingHamzaScriptUrls)].length);
  console.log('T & !H', [...setIntersection(trackingScriptUrls, nonTrackingHamzaScriptUrls)].length);
  console.log('T & H', [...setIntersection(trackingScriptUrls, trackingHamzaScriptUrls)].length);

  console.log([...setIntersection(nonTrackingScriptUrls, trackingHamzaScriptUrls)]);

})();
