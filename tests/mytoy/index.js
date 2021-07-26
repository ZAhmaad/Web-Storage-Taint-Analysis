// Instrument with: rm -rf instrumented && node $JALANGIHOME/src/js/commands/instrument.js --inlineIID --inlineSource -i --inlineJalangi --analysis $JALANGIHOME/src/js/sample_analyses/ChainedAnalyses.js --analysis $JALANGIHOME/src/js/runtime/SMemory.js --analysis analysis.js --outputDir ./instrumented ./tests/mytoy

"use strict";

function taint(x) {
  return x;
}

function logTaint(x) {}

function f(x, y) {
  return x;
}

function g(x, y) {
  return y;
}

function h(f, a) {
  return function (x, y) {
    return f(x, y) + a;
  };
}

var a = taint(5);
var b = 7;
var c = f(a, b);
var d = g(a, b);

logTaint("a", a);
logTaint("b", b);
logTaint("c", c);
logTaint("d", d);

var h1 = h(f, a);
var e = h1(b, b);

logTaint("h1", h1);
logTaint("e", e);

console.log(e);
