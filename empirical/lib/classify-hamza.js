"use strict";

import {
  labels,
  labelsRelatedTo
} from "./labels.js";
import { inject } from "./di.js";

function classifyTracking(flow, documentOrigin, isKnownTrackingScript) {
  return labels(flow)
    .some(lbl => lbl.scriptUrl && isKnownTrackingScript(lbl.scriptUrl, documentOrigin));
}

function extractTrackingScriptUrls(flow, documentOrigin, isKnownTrackingScript) {
  const trackingScriptUrls = labels(flow)
    .filter(lbl => lbl.scriptUrl && isKnownTrackingScript(lbl.scriptUrl, documentOrigin))
    .map(lbl => lbl.scriptUrl.href);
  return new Set(trackingScriptUrls);
}

function classifyTrackingHamza(flow, secondaryFlow) {
  return (
    secondaryFlow !== null &&
    alignedStorageLabels(longLocalStorageLabels(flow), longLocalStorageLabels(secondaryFlow))
      .some(([lbl1, lbl2]) => areSignificantlyDifferent(lbl1.extra[2], lbl2.extra[2]))
  );
}

function extractTrackingHamzaScriptUrls(flow, secondaryFlow) {
  if (secondaryFlow !== null) {
    const trackingScriptUrls =
      alignedStorageLabels(longLocalStorageLabels(flow), longLocalStorageLabels(secondaryFlow))
        .filter(([lbl1, lbl2]) => areSignificantlyDifferent(lbl1.extra[2], lbl2.extra[2]))
        .map(([lbl, _]) => lbl)
        .filter(lbl => lbl.scriptUrl)
        .map(lbl => lbl.scriptUrl.href);
    return new Set(trackingScriptUrls);
  }
  return [];
}

function longLocalStorageLabels(flow) {
  return labelsRelatedTo(flow, "storage")
    .filter(lbl => lbl.extra[0] === 'localStorage')
    .filter(lbl => lbl.extra[2] && lbl.extra[2].length >= 8);
}

function aligned(items1, items2, mappingFn) {
  const result = [];
  const candidateItems2 = [...items2]; // create a shallow copy of items2
  for (let i1 of items1) {
    const correspondingIndex = candidateItems2.findIndex((i2) => mappingFn(i1, i2));
    if (correspondingIndex >= 0) {
      result.push([i1, candidateItems2.splice(correspondingIndex, 1)[0]]);
    }
  }
  return result;
}

function sameLabelType(lbl1, lbl2) {
  return (
    lbl1.name === lbl2.name &&
    lbl1.iid === lbl2.iid &&
    lbl1.scriptUrl?.href === lbl2.scriptUrl?.href
  );
}

function alignedLabels(lbl1, lbl2) {
  return aligned(lbl1, lbl2, sameLabelType);
}

function sameStorageLabelType(lbl1, lbl2) {
  return (
    sameLabelType(lbl1, lbl2) &&
    lbl1.extra[0] === lbl2.extra[0] &&
    lbl1.extra[1] === lbl2.extra[1]
  );
}

function alignedStorageLabels(labels1, labels2) {
  return aligned(labels1, labels2, sameStorageLabelType);
}

function alignedFlows(flows1, flows2) {
  return aligned(flows1, flows2, (flow1, flow2) =>
    flow1[0].length === flow2[0].length &&
    alignedLabels(flow1[0], flow2[0]).length === flow1[0].length &&
    sameLabelType(flow1[1], flow2[1])
  );
}

function areSignificantlyDifferent(value1, value2) {
  [value1, value2] = [removeTimestamps(value1), removeTimestamps(value2)];
  [value1, value2] = removeRecurrentSubstrings(value1, value2);
  return similarityScore(value1, value2) < 0.66;
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

function removeRecurrentSubstrings(str1, str2) {
  let [tks1, tks2] = stringToMinimalTokenSequence(str1, str2);
  let matchList;
  while (matchList = longestCommonSubsequenceTokenSequence(tks1, tks2),
    matchList.map(([i1, _]) => tks1[i1].string.length).reduce((acc, cur) => acc + cur, 0) > 2) {
    tks1 = filterTokensOutOfTokenSequence(tks1, matchList.map(([i1, _]) => i1));
    tks2 = filterTokensOutOfTokenSequence(tks2, matchList.map(([_, i2]) => i2));
  }
  return [tks1.map(t => t.string).join(""), tks2.map(t => t.string).join("")];
}

class Token {
  constructor(string) {
    this.string = string;
  }

  equals(t) {
    return (t.string === this.string);
  }

  toString() {
    return this.string;
  }
}

function stringToMinimalTokenSequence(str1, str2) {
  const [i1, i2, len] = longestCommonSubstring(str1, str2);
  if (len > 1) {
    const [l1, l2] = stringToMinimalTokenSequence(str1.substring(0, i1), str2.substring(0, i2));
    const [r1, r2] = stringToMinimalTokenSequence(str1.substring(i1 + len), str2.substring(i2 + len));
    const token = new Token(str1.substring(i1, i1 + len));
    return [[...l1, token, ...r1], [...l2, token, ...r2]];
  } else {
    return [
      [...str1].map(char => new Token(char)),
      [...str2].map(char => new Token(char)),
    ];
  }
}

function longestCommonSubsequenceTokenSequence(tks1, tks2) {
  const m = tks1.length;
  const n = tks2.length;

  const C = new Array(m + 1);
  for (let i = 0; i < C.length; i++) {
    C[i] = new Array(n + 1);
  }

  let i, j;
  for (i = 0; i <= m; ++i) {
    for (j = 0; j <= n; ++j) {
      if (i === 0 || j === 0) {
        C[i][j] = 0;
      } else if (tks1[i - 1].equals(tks2[j - 1])) {
        C[i][j] = C[i - 1][j - 1] + 1;
      } else {
        const c1 = C[i - 1][j];
        const c2 = C[i][j - 1];
        C[i][j] = c1 > c2 ? c1 : c2;
      };
    }
  }

  const matches = [];
  for (i = m, j = n; C[i][j] !== 0;) {
    if (tks1[i - 1].equals(tks2[j - 1])) {
      matches.unshift([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (C[i][j - 1] > C[i - 1][j]) {
      j -= 1;
    } else {
      i -= 1;
    }
  }

  return matches;
}

function filterTokensOutOfTokenSequence(tks, indexes) {
  const n = tks.length;
  const m = indexes.length;

  const result = [];
  for (let i = 0, j = 0; i < n, j < m; ++i) {
    if (i !== indexes[j]) {
      result.push(tks[i]);
    } else {
      j += 1;
    }
  }

  return result;
}

function similarityScore(str1, str2) {
  return (2 * matchingCharacters(str1, str2)) / (str1.length + str2.length);
}

function matchingCharacters(str1, str2) {
  const [s1, s2, len] = longestCommonSubstring(str1, str2);
  if (len > 0) {
    return len + matchingCharacters(str1.substring(0, s1), str2.substring(0, s2)) + matchingCharacters(str1.substring(s1 + len), str2.substring(s2 + len));
  } else {
    return 0;
  }
}

function extractScriptUrls(flow) {
  return new Set(labels(flow)
    .filter(lbl => lbl.scriptUrl)
    .map(lbl => lbl.scriptUrl.href));
}

function classify(data, secondaryData) {
  const domainParser = inject("domainParser");
  return data
    .map((site, siteIndex) => {
      console.log(`classifying ${siteIndex + 1} / ${data.length}`);
      const documentOrigin = site.url.origin;
      const isKnownTrackingScript = inject("trackingWithCache")(new Map());
      const secondarySite = secondaryData.find((secondarySite) => secondarySite.url.href === site.url.href);
      if (secondarySite && site.flows && secondarySite.flows && siteIndex !== 882) {
        const flowsAlignment = alignedFlows(site.flows, secondarySite.flows);
        return {
          url: site.url,
          flows: site.flows
            .map(flow => {
              const flowCorrespondance = flowsAlignment.find(([flow1, _]) => flow1 === flow);
              return {
                original: flow,
                tracking: classifyTracking(flow, documentOrigin, isKnownTrackingScript),
                trackingHamza: classifyTrackingHamza(flow, flowCorrespondance ? flowCorrespondance[1] : null),
                trackingScriptUrls: extractTrackingScriptUrls(flow, documentOrigin, isKnownTrackingScript),
                trackingHamzaScriptUrls: extractTrackingHamzaScriptUrls(flow, flowCorrespondance ? flowCorrespondance[1] : null),
                scriptUrls: extractScriptUrls(flow),
              };
            })
        };
      } else {
        console.count('flawed');
        return {
          url: site.url,
          flows: site.flows
            .map(flow => {
              return {
                original: flow,
                tracking: classifyTracking(flow, documentOrigin, isKnownTrackingScript),
                trackingHamza: false,
                trackingScriptUrls: extractTrackingScriptUrls(flow, documentOrigin, isKnownTrackingScript),
                trackingHamzaScriptUrls: [],
                scriptUrls: extractScriptUrls(flow),
              };
            })
        };
      }
    });
}

export {
  classify,
};
