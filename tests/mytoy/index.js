// Instrument with: rm -rf instrumented && node $JALANGIHOME/src/js/commands/instrument.js --inlineIID --inlineSource -i --inlineJalangi --analysis $JALANGIHOME/src/js/sample_analyses/ChainedAnalyses.js --analysis $JALANGIHOME/src/js/runtime/SMemory.js --analysis analysis.js --outputDir ./instrumented ./tests/mytoy

"use strict";

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

var a = +window.localStorage.getItem("a") + 5;
var b = 7;
var c = f(a, b);
var d = g(a, b);

window.localStorage.setItem("a", a);
window.localStorage.setItem("b", b);
window.localStorage.setItem("c", c);
window.localStorage.setItem("d", d);

var h1 = h(f, a);
var e = h1(b, b);

window.localStorage.setItem("h1", h1);
window.localStorage.setItem("e", e);

console.log("hello".toUpperCase());

var o = { a: 6 };
o.b = +window.localStorage.getItem("b") + 8;
var c = o.b;
window.localStorage.setItem("c", c);
console.log(o.a + o.b);

if (false) {
    console.log(1);
} else {
    console.log(2);
}
