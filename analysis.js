(function (sandbox) {

    /**
     * Label constructor
     *
     * @param {string} type The string identifying the type of this Label
     * @param {number} iid The instruction ID
     * @param {any[]} extra: Extra info about this Label
     */
    function Label(type, iid, ...extra) {
        this.type = type;
        this.sid = sandbox.sid;
        this.iid = iid;
        this.extra = extra;
    }

    /**
     * It returns true whether s1 and s2 are the same Label, false otherwise.
     *
     * @param {Label} s1
     * @param {Label} s2
     * @returns {boolean}
     */
    Label.equals = function (s1, s2) {
        return (
            s1.type === s2.type &&
            s1.sid === s2.sid &&
            s1.iid === s2.iid &&
            s1.extra.length === s2.extra.length &&
            s1.extra.every((value, index) => s2.extra[index] === value)
        );
    };

    /**
     * It returns a string that represents this Label.
     *
     * @returns {string}
     */
    Label.prototype.toString = function () {
        return `(${JSON.stringify(this.type)}, ${sandbox.iidToLocation(this.sid, this.iid)}${this.extra.length > 0 ? (", " + this.extra.map(x => JSON.stringify(x)).join(", ")) : ""})`;
    };

    /**
     * Taint constructor
     */
    function Taint() {
        this.status = [];
    }

    Taint.__bottomVal = new Taint();

    /**
     * It returns the bottom value of the Taint lattice (i.e., the empty set of Label).
     *
     * @returns {Taint}
     */
    Taint.bottom = function () {
        return Taint.__bottomVal;
    };

    /**
     * It returns a new set of Label which is the set union of each set of Label in args.
     *
     * @param {Label[][]} args
     * @returns {Label[]}
     */
    Taint.__statusJoin = function (...args) {
        return args.reduce((a, x) => {
            a.push(...x.filter(s2 => !a.some(s1 => Label.equals(s1, s2))));
            return a;
        }, []);
    };

    /**
     * It returns a new Taint which is the set union of each Taint in args.
     *
     * @param {Taint[]} args
     * @returns {Taint}
     */
    Taint.join = function (...args) {
        if (args.length === 0) {
            return Taint.bottom();
        }
        var result = new Taint();
        result.status = Taint.__statusJoin(...args.map(t => t.status))
        return result.status.length > 0 ? result : Taint.bottom();
    };

    /**
     * It returns a copy of this Taint including the Label s.
     *
     * @param {Label} s
     * @returns {Taint}
     */
    Taint.prototype.withLabel = function (s) {
        if (s === null) {
            return this;
        }
        var result = new Taint();
        result.status = Taint.__statusJoin(this.status, [s]);
        return result;
    };

    /**
     * It returns a string that represents this Taint.
     *
     * @returns {string}
     */
    Taint.prototype.toString = function () {
        return "[" + this.status.map(s => s.toString()).join(", ") + "]";
    }

    /**
     * Box constructor
     */
    function Box(x) {
        this.val = x;
    }

    var $SafeUnboxing = Symbol("$SafeUnboxing");

    /**
     * It returns the value inside the Box.
     * NOTE: safeUnboxing has to be set, so that it is possible to identify whether the box has been exposed to the user, which could break the script execution.
     *
     * @param {boolean} safeUnboxing
     * @returns {any}
     */
    Box.prototype.valueOf = function (safeUnboxing) {
        if (safeUnboxing !== $SafeUnboxing) {
            throw new Error("Box has been exposed!");
        }
        return this.val;
    };

    /**
     * It returns a string that represents this Box.
     * NOTE: safeUnboxing has to be set, so that it is possible to identify whether the box has been exposed to the user, which could break the script execution.
     *
     * @param {boolean} safeUnboxing
     * @returns {string}
     */
    Box.prototype.toString = function (safeUnboxing) {
        if (safeUnboxing !== $SafeUnboxing) {
            throw new Error("Box has been exposed!");
        }
        return `Box(${this.val})`;
    };

    /**
     * It returns a boxed value with Taint t from the actual value x.
     *
     * @param {any} x
     * @param {Taint} t
     * @returns {any}
     */
    function box(x, t = Taint.bottom()) {
        if (isPrimitive(x)) {
            var boxed = new Box(x);
            boxed.taint = t;
            return boxed;
        }
        return x;
    }

    /**
     * It returns the actual value and the corresponding Taint from the boxed value y.
     *
     * @param {any} y
     * @returns {[any, Taint]}
     */
    function unbox(y) {
        return y instanceof Box
            ? [y.valueOf($SafeUnboxing), y.taint]
            : [y, Taint.bottom()];
    }

    function unboxAll(args) {
        return args
            .map(a => unbox(a))
            .reduce((ut_args, [u_a, t_a]) => {
                ut_args[0].push(u_a);
                ut_args[1].push(t_a);
                return ut_args;
            }, [[], []]);
    }

    /**
     * The collection of tainted flows.
     *
     * @type {[Taint, Label]}
     */
    var taintedFlows = [];

    /**
     * It collects the tainted flow from source Taint sourceTaint to sink Label sinkLabel, if sourceTaint is not the bottom value.
     *
     * @param {any} x The value from where the Taint comes from
     * @param {Label} label The Label of the sink
     */
    function sink(sourceTaint, sinkLabel) {
        if (sourceTaint !== Taint.bottom()) {
            taintedFlows.push([sourceTaint, sinkLabel]);
        }
    };

    /**
     * It reports all the tainted flows that have been collected.
     */
    function report() {
        for (var flow of taintedFlows) {
            console.log(flow);
        }
    };

    /* Utils */

    /**
     * It returns true whether x is a JS primitive value, false otherwise.
     *
     * @param {any} x
     * @returns {boolean}
     */
    function isPrimitive(x) {
        return (
            x === null ||
            ["undefined", "boolean", "number", "bigint", "string", "symbol"].includes(typeof x)
        );
    }

    var $UserFunction = Symbol("$UserFunction");

    /**
     * It returns true whether x is a user function, false otherwise.
     *
     * @param {any} x
     * @returns {boolean}
     */
    function isUserFunction(x) {
        return (
            typeof x === "function" &&
            typeof x[$UserFunction] === "boolean" &&
            x[$UserFunction]
        );
    }

    /**
     * TaintAnalysis class
     */
    function TaintAnalysis() {

        // Do not let Jalangi perform this operation
        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            return { base: base, offset: offset, skip: true };
        };

        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            var [u_base, t_base] = unbox(base);
            var [u_offset, t_offset] = unbox(offset);

            var u_result = u_base[u_offset];

            var documentCookie = (u_base === window.document && u_offset === "cookie");
            var t_result = Taint.join(t_base, t_offset)
                .withLabel(documentCookie ? new Label("document.cookie", iid) : null);

            return { result: box(u_result, t_result) };
        };

        // Do not let Jalangi perform this operation
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            return { base: base, offset: offset, val: val, skip: true };
        };

        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            var [u_base, t_base] = unbox(base);
            var [u_offset, t_offset] = unbox(offset);

            /*
             * One does not simply do:
             *
             *   u_base[u_offset] = val;
             *
             * If the property has a setter and it is a native function,
             * the boxed value will be exposed!
             * It is necessary to unbox val before doing the assignment.
             */
            var setter = u_base.__lookupSetter__(u_offset);
            if (setter !== undefined && !isUserFunction(setter)) {
                var [u_val, t_val] = unbox(val);
                u_base[u_offset] = u_val;
            } else {
                u_base[u_offset] = val;
            }

            return { result: val };
        };

        // Do not let Jalangi perform this operation if f is a native function, i.e. the code is hidden
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            return { f: f, base: base, args: args, skip: true };
        };

        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            if (!isUserFunction(f)) {
                var [u_f, t_f] = unbox(f);
                var [u_base, t_base] = unbox(base);
                var [u_args, t_args] = unboxAll(Array.from(args));

                /*
                 * Wrap each native function passed as argument to a native
                 * function call, so that it is possible to unbox the values
                 * passed as arguments to a possible call of such function.
                 */
                u_args = u_args.map(u_a =>
                    typeof u_a === "function" && !isUserFunction(u_a)
                    ? (function(...args1) {
                        var [u_args1, t_args1] = unboxAll(args1);
                        return u_a.call(null, ...u_args1);
                    }).bind(null)
                    : u_a);

                var u_result = isConstructor
                    ? new u_f(...u_args)
                    : u_f.call(u_base, ...u_args);

                var t_result = isConstructor
                    ? Taint.join(t_f, ...t_args)
                    : Taint.join(t_base, t_f, ...t_args);
                if (f === Storage.prototype.getItem || f === Storage.prototype.setItem) {
                    var instance = (
                        base === window.localStorage ? "localStorage" : (
                            base === window.sessionStorage ? "sessionStorage" : "unknown"));

                    if (f === Storage.prototype.getItem) {
                        t_result = t_result
                            .withLabel(new Label("Storage.getItem", iid, instance, u_args[0]));
                    } else {
                        sink(t_args[1], new Label("Storage.setItem", iid, instance, u_args[0]));
                    }
                } else if (f === XMLHttpRequest.prototype.open) {
                    sink(t_args[1], new Label("XMLHTTPRequest.open", iid));
                }

                return { result: box(u_result, t_result) };
            } else {
                var [u_f, t_f] = unbox(f);
                var [u_base, t_base] = unbox(base);

                var result = isConstructor
                    ? new u_f(...args)
                    : u_f.call(u_base, ...args);

                return { result: result };
            }
        };

        this.conditional = function (iid, result) {
            var [u_result, t_result] = unbox(result);
            return {result: u_result};
        };

        // Do not let Jalangi perform this operation
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
            var [u_left, t_left] = unbox(left);
            var [u_right, t_right] = unbox(right);

            var u_result = applyBinary(op, u_left, u_right);

            var t_result = Taint.join(t_left, t_right);

            return { result: box(u_result, t_result) };
        };

        // Do not let Jalangi perform this operation
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
            var [u_left, t_left] = unbox(left);

            var u_result = applyUnary(op, u_left);

            var t_result = t_left;

            return { result: box(u_result, t_result) };
        };

        this.literal = function (iid, val, hasGetterSetter) {
            if (typeof val === "function") {
                val[$UserFunction] = true;
            }

            return { result: box(val) };
        };

        this.endExecution = function () {
            console.log("endExecution()");
            report();
        };
    };

    sandbox.analysis = new TaintAnalysis();
})(J$);
