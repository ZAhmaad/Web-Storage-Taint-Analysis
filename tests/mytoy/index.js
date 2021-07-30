// Instrument with: rm -rf instrumented/mytoy && node $JALANGIHOME/src/js/commands/instrument.js --inlineIID --inlineSource -i --inlineJalangi --analysis $JALANGIHOME/src/js/sample_analyses/ChainedAnalyses.js --analysis $JALANGIHOME/src/js/runtime/SMemory.js --analysis analysis.js --outputDir ./instrumented ./tests/mytoy

"use strict";

function taint(x) {
  return x;
}

function checkTaint(x) { }

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

console.log("a", checkTaint(a));
console.log("b", checkTaint(b));
console.log("c", checkTaint(c));
console.log("d", checkTaint(d));

var h1 = h(f, a);
var e = h1(b, b);

console.log("h1", checkTaint(h1));
console.log("e", checkTaint(e));

console.log("hello".toUpperCase());

var o = { a: 6 };
o.b = taint(8);
console.log(o.a + o.b);

if (false) {
  console.log(1);
} else {
  console.log(2);
}
