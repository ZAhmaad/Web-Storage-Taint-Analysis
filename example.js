"use strict";
 
/**
 * The result of this function will be tained by Analysis (by name)
 */
function taint(x) {
    
    return x;
}

function isTaint(x) { return false; }



function foo(e,f) {

    
    return e;
}

a = taint(8);
b = 7;
d = foo(a,b)

console.log('IsTaint a: ' + isTaint(a));
console.log('IsTaint b: ' + isTaint(b));
console.log('IsTaint d: ' + isTaint(d));

 
/**
 * Result of this function will be replaced with whether the value is taint
 */

//  function getItem(x) { 
//     //  y = getItem(y);
//     //  return y;
    
//    //y = getItem(x);
// //      y = taint(5);
// //      console.log('IsTaint y: ' + isTaint(y));
// //    return y;
     
//      return taint("abc");
//   }

 function getItem(x) {
    y = taint(y);
    
    
     return y;
 }

 
var x = getItem("hell");
// var x = taint("foo");
 var y = 'Hello World';

 
console.log(x);
console.log(y);

// var np = y;
y = x + y;
 var z = y;
 // var a = 4;
 
 
// function DoDo() {
// }
 
// console.log('IsTaint DoDo: ' + isTaint(DoDo(5)));
 
// DoDo = taint(DoDo);
 
// console.log('IsTaint DoDo: ' + isTaint(DoDo(5)));
 console.log('IsTaint x: ' + isTaint(x));
 console.log('IsTaint y: ' + isTaint(y));
 console.log('IsTaint z: ' + isTaint(z));