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

window.localStorage.setItem("e", e);

var o = { a: 6 };
o.b = a;

window.localStorage.setItem("e", o.a);
window.localStorage.setItem("e", o.b);
console.log(o.a + o.b);

var j = o.b;

window.localStorage.setItem("e", j && 12);
window.localStorage.setItem("e", j || 12);

Object.defineProperty(o, "j", {
  enumerable: true,
  configurable: true,
  get: function () {
    return j;
  },
  set: function (val) {}
});

window.localStorage.setItem("e", o.j);

var s;
console.log(14 + (s = o.b += 2));
window.localStorage.setItem("e", s);
