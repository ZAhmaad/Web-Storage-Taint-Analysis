// Instrument with: rm -rf instrumented && node $JALANGIHOME/src/js/commands/instrument.js --inlineIID --inlineSource -i --inlineJalangi --analysis $JALANGIHOME/src/js/sample_analyses/ChainedAnalyses.js --analysis $JALANGIHOME/src/js/runtime/SMemory.js --analysis analysis.js --outputDir ./instrumented ./tests/cc

"use strict";

function initClickCount() {
    if (!window.localStorage.getItem("clickCount")) {
        window.localStorage.setItem("clickCount", 0);
    }
    window.localStorage.setItem("cookies", document.cookie);
}

function setClickCount(cc) {
    window.localStorage.setItem("clickCount", cc);
    document.body.innerHTML += "</br>" + cc;
}

function updateClickCount() {
    var cc = Number(window.localStorage.getItem("clickCount"));
    setClickCount(cc + 1);
}

initClickCount();
