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

    TaintSource.prototype.toString = function (s) {
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
        var sobj = sandbox.smemory.getShadowObjectOfObject(o);
        return sobj && sobj.taint;
    };

    TaintUtils.setTaintOfObject = function (o, t) {
        var sobj = sandbox.smemory.getShadowObjectOfObject(o);
        if (sobj) {
            sobj.taint = t;
        }
        return !!sobj;
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

    Box.prototype.toString = function () {
        return `Box(${JSON.stringify(this.val)})`;
    };

    // Boxing/Unboxing tools
    function box(x) {
        var result = (isPrimitive(x) ? new Box(x) : x);
        TaintUtils.setTaintOfObject(result,
            Taint.join(...Array.from(arguments)
                .slice(1)
                .map(a => TaintUtils.getTaintOfObject(a))));
        return result;
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

        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            return { f: f, base: base, args: args, skip: isNativeFunction(f) };
        };

        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            if (isNativeFunction(f)) {
                return { result: box(f.apply(base, Array.from(args).map(a => unbox(a))), ...args) };
            }
            if (taint && f === taint) {
                TaintUtils.setTaintOfObject(result,
                    TaintUtils.getTaintOfObject(result)
                        .withSource(new TaintSource("taint", sandbox.sid, iid)));
            } else if (logTaint && f === logTaint) {
                console.log(args[0].valueOf(), TaintUtils.getTaintOfObject(args[1]).toString());
            }
            return { result: result };
        };

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

        this.binary = function (iid, op, left, right, result, isOpAssign, isSwitchCaseComparison, isComputed) {
            return { result: box(applyBinary(op, unbox(left), unbox(right)), left, right) };
        };

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

        this.unary = function (iid, op, left, result) {
            return { result: box(applyUnary(op, unbox(left)), left) };
        };

        this.literal = function (iid, val, hasGetterSetter) {
            return { result: box(val) };
        };
    };

    sandbox.analysis = new TaintAnalysis();
})(J$);
