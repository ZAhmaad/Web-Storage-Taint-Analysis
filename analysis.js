(function (sandbox) {

    /**
     * TaintSource class
     * label: a string identifying the type of source
     * sid: script ID where the taint comes from
     * iid: instruction ID where the taint comes from
     * extra: extra info about this source
     */
    function TaintSource(label, sid, iid) {
        this.label = label;
        this.sid = sid;
        this.iid = iid;
        this.extra = Array.from(arguments).slice(3);
    }

    // it returns true whether s1 and s2 represents the same source, false otherwise
    TaintSource.equals = function (s1, s2) {
        return (
            s1.label === s2.label &&
            s1.sid === s2.sid &&
            s1.iid === s2.iid &&
            s1.extra.length === s2.extra.length &&
            s1.extra.every((value, index) => s2.extra[index] === value)
        );
    };

    // it returns a string that represents this source
    TaintSource.prototype.toString = function () {
        return `(${JSON.stringify(this.label)}, ${sandbox.iidToLocation(this.sid, this.iid)}${this.extra.length > 0 ? (", " + this.extra.map(x => JSON.stringify(x)).join(", ")) : ""})`;
    };

    /**
     * Taint class
     */
    function Taint() {
        this.status = [];
    }

    Taint.__bottomVal = new Taint();

    // bottom value of the taint lattice (empty set of sources)
    Taint.bottom = function () {
        return Taint.__bottomVal;
    };

    // it returns a new taint status which joins (set union) all the taint statuses passed in arguments
    Taint.__statusJoin = function () {
        return Array.from(arguments).reduce((a, x) => [
            ...a,
            ...x.filter(s2 => !a.some(s1 => TaintSource.equals(s1, s2)))
        ], []);
    };

    // it returns a new taint which joins (set union) all the taints passed in arguments
    Taint.join = function () {
        if (arguments.length === 0) {
            return Taint.bottom();
        }
        var result = new Taint();
        result.status = Taint.__statusJoin(...Array.from(arguments).map(t => t.status))
        return result;
    };

    // it returns a new taint whose sources are the ones of this and s
    Taint.prototype.withSource = function (s) {
        var result = new Taint();
        result.status = Taint.__statusJoin(this.status, [s]);
        return result;
    };

    // it returns a string that represents this
    Taint.prototype.toString = function () {
        return "[" + this.status.map(s => s.toString()).join(", ") + "]";
    }

    /**
     * TaintUtils class
     */
    function TaintUtils() {
    }

    // it returns the Taint object associated to o (o must be Box or object, but taintedness is tracked only for boxed primitive values)
    TaintUtils.getTaintOfObject = function (o) {
        if (o instanceof Box) {
            return o.taint;
        }
        return Taint.bottom();
    };

    // it sets the Taint object associated to o (o must be Box or object, but taintedness is tracked only for boxed primitive values)
    TaintUtils.setTaintOfObject = function (o, t) {
        if (o instanceof Box) {
            o.taint = t;
        }
    };

    // a collector for the tainted flows
    var taintedFlows = [];

    // if o is tainted, then it stores the tracked tainted flow, i.e. the pair source-sink (s is a TaintSource object that represents the sink)
    TaintUtils.sink = function (o, s) {
        var t = TaintUtils.getTaintOfObject(o);
        if (t && t !== Taint.bottom()) {
            taintedFlows.push([t, s]);
        }
    };

    // it reports all the tainted flows that have been tracked
    TaintUtils.report = function () {
        for (var f of taintedFlows) {
            console.log(f);
        }
    }

    /**
     * Box class
     */
    function Box(x) {
        this.val = x;
    }

    // it returns the boxed value
    Box.prototype.valueOf = function (mustBeTrue) {
        if (!mustBeTrue) {
            throw new Error("Box has been exposed!");
        }
        return this.val;
    };

    // it returns a string that represents this (mustBeTrue has to be set, so that it is possible to identify if the box has been exposed to the user, which could break the script execution)
    Box.prototype.toString = function (mustBeTrue) {
        if (!mustBeTrue) {
            throw new Error("Box has been exposed!");
        }
        return `Box(${this.val})`;
    };

    /**
     * Boxing/Unboxing tools
     */
    // it returns a box which contains x and propagates the taint from the rest of arguments (only primitive values are boxed)
    function box(x) {
        if (isPrimitive(x)) {
            var result = new Box(x);
            TaintUtils.setTaintOfObject(result,
                Taint.join(...Array.from(arguments)
                    .slice(1)
                    .map(a => TaintUtils.getTaintOfObject(a))));
            return result;
        }
        return x;
    }

    // it returns the value that is boxed in x
    function unbox(x) {
        return (x instanceof Box ? x.valueOf(true) : x);
    }

    /**
     * Auxiliary tools
     */
    // it returns true whether x is a JS primitive value, false otherwise
    function isPrimitive(x) {
        return (
            x === null ||
            ["undefined", "boolean", "number", "bigint", "string", "symbol"].includes(typeof x)
        );
    }

    // it returns true whether x is a native function, false otherwise
    function isNativeFunction(x) {
        return (
            typeof x === "function" && (
                x.toString().endsWith("{ [native code] }") || // ugly hack that works on Chrome
                x.toString().endsWith("{\n    [native code]\n}") // ugly hack that works on Firefox
            )
        );
    }

    /**
     * TaintAnalysis class
     */
    function TaintAnalysis() {

        // Do not let Jalangi perform this operation (base and offset could be boxed)
        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            return { base: base, offset: offset, skip: true };
        };

        // Unbox base and offset and box the result (if the result is already boxed, then the taint is the one stored inside the box, otherwise it is untainted, for e.g., `window.Infinity`)
        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            result = box(unbox(base)[unbox(offset)], base, offset);
            if (base === window.document && offset === "cookie") {
                // taint document.cookie
                TaintUtils.setTaintOfObject(result,
                    TaintUtils.getTaintOfObject(result)
                        .withSource(new TaintSource("document.cookie", sandbox.sid, iid)));
            }
            return { result: result };
        };

        // Do not let Jalangi perform this operation (base and offset could be boxed)
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return { base: base, offset: offset, val: val, skip: true };
        };

        // Unbox base and offset, write val and return val as is (it is already boxed)
        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            unbox(base)[unbox(offset)] = val;
            return { result: val };
        };

        // Do not let Jalangi perform this operation if f is a native function, i.e. the code is hidden (args could be boxed)
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            return { f: f, base: base, args: args, skip: isNativeFunction(f) };
        };

        // If f is a native function, then unbox the base and args, apply the function and box the result, otherwise return the result as is (it is already boxed)
        // In particular, we need to unbox the base in case of native function calls because it could be the method of a primitive value (such value is boxed)
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            if (isNativeFunction(f)) {
                if (isConstructor) {
                    result = box(new f(...Array.from(args).map(a => unbox(a))), ...args);
                } else {
                    result = box(f.apply(unbox(base), Array.from(args).map(a => unbox(a))), base, ...args);
                }
            }
            if (f === Storage.prototype.getItem) {
                // taint the value of the key
                var instance = (
                    base === window.localStorage ? "localStorage" : (
                        base === window.localStorage ? "sessionStorage" : "unknown"));
                var key = unbox(args[0]);
                TaintUtils.setTaintOfObject(result,
                    TaintUtils.getTaintOfObject(result)
                        .withSource(new TaintSource("Storage.getItem", sandbox.sid, iid, instance, key)));
            } else if (f === Storage.prototype.setItem) {
                // sink the 2nd argument of a Storage.setItem call, i.e. the value you want to give the key you are creating/updating
                var instance = (
                    base === window.localStorage ? "localStorage" : (
                        base === window.localStorage ? "sessionStorage" : "unknown"));
                var key = unbox(args[0]);
                TaintUtils.sink(args[1], new TaintSource("Storage.setItem", sandbox.sid, iid, instance, key));
            } else if (f === XMLHttpRequest.prototype.open) {
                // sink the 2nd argument of a XMLHTTPRequest.open call, i.e. the URL to send the request to
                TaintUtils.sink(args[1], new TaintSource("XMLHTTPRequest.open", sandbox.sid, iid));
            }
            return { result: result };
        };

        // Unbox the conditional value (otherwise a Box object is always truly)
        this.conditional = function (iid, result) {
            return {result: unbox(result)};
        };

        // Do not let Jalangi perform this operation (left and right could be boxed)
        this.binaryPre = function (iid, op, left, right, isOpAssign, isSwitchCaseComparison, isComputed) {
            return { op: op, left: left, right: right, skip: true };
        };

        function applyBinary(op, x, y) {
            switch (op) {
                case "+":
                    return x + y;
                case "-":
                    return x - y;
                case "*":
                    return x * y;
                case "/":
                    return x / y;
                case "%":
                    return x % y;
                case "&":
                    return x & y;
                case "|":
                    return x | y;
                case "^":
                    return x ^ y;
                case "<<":
                    return x << y;
                case ">>":
                    return x >> y;
                case ">>>":
                    return x >>> y;
                case "<":
                    return x < y;
                case ">":
                    return x > y;
                case "<=":
                    return x <= y;
                case ">=":
                    return x >= y;
                case "==":
                    return x == y;
                case "!=":
                    return x != y;
                case "===":
                    return x === y;
                case "!==":
                    return x !== y;
                case "instanceof":
                    return x instanceof y;
                case "delete":
                    return delete x[y];
                case "in":
                    return x in y;
            }
        }

        // Unbox left and right and box the result
        this.binary = function (iid, op, left, right, result, isOpAssign, isSwitchCaseComparison, isComputed) {
            return { result: box(applyBinary(op, unbox(left), unbox(right)), left, right) };
        };

        // Do not let Jalangi perform this operation (left could be boxed)
        this.unaryPre = function (iid, op, left) {
            return { op: op, left: left, skip: true };
        };

        function applyUnary(op, x) {
            switch (op) {
                case "+":
                    return +x;
                case "-":
                    return -x;
                case "~":
                    return ~x;
                case "!":
                    return !x;
                case "typeof":
                    return typeof x;
                case "void":
                    return void x;
            }
        }

        // Unbox left and box the result
        this.unary = function (iid, op, left, result) {
            return { result: box(applyUnary(op, unbox(left)), left) };
        };

        // Box every literal value (it is untainted)
        this.literal = function (iid, val, hasGetterSetter) {
            return { result: box(val) };
        };

        // It reports all the tainted flows
        this.endExecution = function () {
            console.log("endExecution()");
            TaintUtils.report();
        };
    };

    sandbox.analysis = new TaintAnalysis();
})(J$);
