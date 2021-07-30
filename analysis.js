(function (sandbox) {

    /**
     * TaintSource class
     */
    function TaintSource(label, sid, iid) {
        this.label = label;
        this.sid = sid;
        this.iid = iid;
    }

    TaintSource.equals = function (s1, s2) {
        return (
            s1.label === s2.label &&
            s1.sid === s2.sid &&
            s1.iid === s2.iid
        );
    };

    TaintSource.prototype.toString = function () {
        return `(${JSON.stringify(this.label)}, ${sandbox.iidToLocation(this.sid, this.iid)})`;
    };

    /**
     * Taint class
     */
    function Taint() {
        this.status = [];
    }

    Taint.__bottomVal = new Taint();

    Taint.bottom = function () {
        return Taint.__bottomVal;
    };

    Taint.__statusJoin = function () {
        return Array.from(arguments).reduce((a, x) => [
            ...a,
            ...x.filter(s2 => !a.some(s1 => TaintSource.equals(s1, s2)))
        ], []);
    };

    Taint.join = function () {
        var result = new Taint();
        result.status = Taint.__statusJoin(...Array.from(arguments).map(t => t.status))
        return result;
    };

    Taint.prototype.withSource = function (s) {
        var result = new Taint();
        result.status = Taint.__statusJoin(this.status, [s]);
        return result;
    };

    Taint.prototype.toString = function () {
        return "[" + this.status.map(s => s.toString()).join(", ") + "]";
    }

    /**
     * TaintUtils class
     */
    function TaintUtils() {
    }

    TaintUtils.getTaintOfObject = function (o) {
        if (isPrimitive(o)) {
            throw new Error("Expected Box or object, but primitive found.");
        }
        if (o instanceof Box) {
            return o.taint;
        }
        return Taint.bottom();
    };

    TaintUtils.setTaintOfObject = function (o, t) {
        if (isPrimitive(o)) {
            throw new Error("Expected Box or object, but primitive found.");
        }
        if (o instanceof Box) {
            o.taint = t;
        }
    };

    /**
     * Box class
     */
    function Box(x) {
        this.val = x;
    }

    Box.prototype.valueOf = function () {
        return this.val;
    };

    Box.prototype.toString = function (mustBeTrue) {
        if (!mustBeTrue) {
            throw new Error("Box has been exposed!");
        }
        return `Box(${this.val})`;
    };

    // Boxing/Unboxing tools
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

    function unbox(x) {
        return (x instanceof Box ? x.valueOf() : x);
    }

    // Auxiliary tools
    function isPrimitive(x) {
        return (
            x === null ||
            ["undefined", "boolean", "number", "bigint", "string", "symbol"].includes(typeof x)
        );
    }

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
            return { result: box(unbox(base)[unbox(offset)]) };
        };

        // Do not let Jalangi perform this operation if f is a native function, i.e. the code is hidden (args could be boxed)
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            return { f: f, base: base, args: args, skip: isNativeFunction(f) };
        };

        // If f is a native function, then unbox the base and args, apply the function and box the result, otherwise return the result as is (it is already boxed)
        // In particular, we need to unbox the base in case of native function calls because it could be the method of a primitive value (such value is boxed)
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            if (isNativeFunction(f)) {
                return { result: box(f.apply(unbox(base), Array.from(args).map(a => unbox(a))), base, ...args) };
            }
            if (taint && f === taint) {
                TaintUtils.setTaintOfObject(result,
                    TaintUtils.getTaintOfObject(result)
                        .withSource(new TaintSource("taint", sandbox.sid, iid)));
            } else if (checkTaint && f === checkTaint) {
                return { result: box(TaintUtils.getTaintOfObject(args[0]).toString(true)) };
            }
            return { result: result };
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
    };

    sandbox.analysis = new TaintAnalysis();
})(J$);
