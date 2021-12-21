// JALANGI DO NOT INSTRUMENT

/**
 * @file Dynamic taint analysis with Jalangi 2
 * @author Samuele Casarin
 *
 */

 (function (J$) {

    const global = this;

    function Label(name, iid, sid, extra = []) {
        this.name = name;
        this.iid = iid;
        this.sid = sid;
        this.location = J$.iidToLocation(sid, iid);
        this.extra = extra.map(e => {
            try {
                return typeof e === "object" ? JSON.stringify(e) : e;
            } catch (e) {
                return null;
            }
        });
    }

    Label.prototype.toString = function () {
        return `${this.location}: ` +
            `Label(${this.name}${this.extra.length > 0 ? ", " + this.extra.map(e => JSON.stringify(e)).join(", ") : ""})`;
    };

    Label.equals = function (x, y) {
        return (
            x.name === y.name &&
            x.iid === y.iid &&
            x.sid === y.sid &&
            x.extra.length === y.extra.length &&
            x.extra.every((e, i) => y.extra[i] === e)
        );
    };

    function Taint(labelSet) {
        this.labelSet = labelSet;
    }

    Taint.prototype.hasLabelWithName = function (name) {
        return this.labelSet.some(label => label.name === name);
    };

    Taint.prototype.toString = function () {
        return (
            `Taint{` + (
                this.labelSet.length > 0
                    ? "\n" + this.labelSet.map(label => "  " + label.toString()).join(",\n") + "\n"
                    : ""
            ) + `}`
        );
    };

    Taint.BOTTOM = new Taint([]);

    Taint.join = function () {
        if (arguments.length === 0) {
            return Taint.BOTTOM;
        }
        const lsArgs = Array.from(arguments)
            .filter(t => t !== Taint.BOTTOM)
            .map(t => t.labelSet);
        if (lsArgs.length === 0) {
            return Taint.BOTTOM;
        }
        const lsResult = lsArgs.reduce((pred, curr) => [
            ...pred,
            ...curr.filter(lsCurr => !pred.some(lsPred => Label.equals(lsPred, lsCurr)))
        ], []);
        return new Taint(lsResult);
    };

    J$.FLOWS = [];

    function sink(sourceTaint, sinkLabel) {
        if (sourceTaint.hasLabelWithName("[Storage].getItem()") || sinkLabel.name === "[Storage].setItem()") {
            J$.FLOWS.push([sourceTaint, sinkLabel]);
            console.log(sourceTaint.toString() + " --> " + sinkLabel);
        }
    }

    const SHADOW_MEMORY = new WeakMap();

    function getPropertyOwner(obj, prop) {
        for (; obj && !Object.getOwnPropertyDescriptor(obj, prop); obj = Object.getPrototypeOf(obj, prop));
        return obj;
    }

    function hasOwnDataProperty(obj, prop) {
        const d = Object.getOwnPropertyDescriptor(obj, prop);
        return (!!d && (!d.get && !d.set));
    }

    function getPropertyTaint(obj, prop) {
        const owner = getPropertyOwner(obj, prop);
        if (owner && hasOwnDataProperty(owner, prop)) {
            const ts = SHADOW_MEMORY.get(owner);
            return (ts ? (ts.get(prop) || Taint.BOTTOM) : Taint.BOTTOM);
        } else {
            return Taint.BOTTOM;
        }
    }

    function putPropertyTaint(obj, prop, t) {
        const owner = getPropertyOwner(obj, prop);
        if (!owner || hasOwnDataProperty(owner, prop)) {
            const ts = SHADOW_MEMORY.get(obj) || SHADOW_MEMORY.set(obj, new Map()).get(obj);
            ts.set(prop, t);
            putFieldInsensitiveTaint(obj, t);
        }
    }

    function deletePropertyTaint(obj, prop) {
        const ts = SHADOW_MEMORY.get(obj);
        if (ts) ts.delete(prop);
    }

    function Scope(chain) {
        this.local = new Map();
        this.chain = chain;
    }

    function getVariableOwnerScope(scope, name) {
        for (; scope && !scope.local.has(name); scope = scope.chain);
        return scope;
    }

    function declareVariable(scope, name, t) {
        if (scope) {
            scope.local.set(name, t);
        } else {
            putPropertyTaint(global, name, t);
        }
    };

    function getVariableTaint(scope, name) {
        if (name === "this") return Taint.BOTTOM;
        const ownerScope = getVariableOwnerScope(scope, name);
        return (ownerScope ? ownerScope.local.get(name) : getPropertyTaint(global, name));
    }

    function putVariableTaint(scope, name, t) {
        if (name === "this") return;
        const ownerScope = getVariableOwnerScope(scope, name);
        if (ownerScope) {
            ownerScope.local.set(name, t);
        } else {
            putPropertyTaint(global, name, t);
        }
    }

    const BOTTOM_CONTEXT = {
        argTaint: function () {
            return Taint.BOTTOM;
        },
        get retTaint() {
            return Taint.BOTTOM;
        }
    };

    function makeOneByOneContext(ts, initRetTaint) {
        let retTaint = initRetTaint || Taint.BOTTOM;
        return {
            argTaint: function (i) {
                return (i < ts.length ? ts[i] : Taint.BOTTOM);
            },
            get retTaint() {
                return retTaint;
            },
            set retTaint(t1) {
                retTaint = Taint.join(retTaint, t1);
            }
        };
    }

    function makeOneForAllWithFeedbackContext(t) {
        return {
            argTaint: function () {
                return t;
            },
            get retTaint() {
                return t;
            },
            set retTaint(t1) {
                t = Taint.join(t, t1);
            }
        }
    }

    function Frame(scope, context) {
        this.scope = scope;
        this.expressionStack = [];
        this.context = context;
        this.calleeContext = BOTTOM_CONTEXT;
    }

    const FRAME_STACK = [new Frame(new Scope(null), BOTTOM_CONTEXT)];

    function topFrame() {
        return FRAME_STACK[FRAME_STACK.length - 1];
    }

    function isPrimitive(val) {
        if (val === undefined || val === null) {
            return true;
        }
        switch (typeof val) {
            case "boolean":
            case "number":
            case "string":
            case "bigint":
            case "symbol":
                return true;
        }
        return false;
    }

    function isObject(val) {
        return !isPrimitive(val);
    }

    function isObjectLiteral(val) {
        if (isObject(val)) {
            const constructor = val["constructor"];
            return (constructor === Object || isUserFunction(constructor));
        }
        return false;
    }

    function isArray(val) {
        if (isObject(val)) {
            const constructor = val["constructor"];
            return (constructor === Array);
        }
        return false;
    }

    const $UserFunction = Symbol("$UserFunction");

    const $ScopeChain = Symbol("$ScopeChain");

    function isFunction(val) {
        return (typeof val === "function");
    }

    function isUserFunction(val) {
        return isFunction(val) && !!val[$UserFunction];
    }

    function isNativeFunction(val) {
        return isFunction(val) && !val[$UserFunction];
    }

    function initObjectLiteral(obj) {
        const props = Object.keys(obj).reverse();
        const ds = Object.getOwnPropertyDescriptors(obj);
        const dataPropsCount = props
            .reduce((sum, p) => {
                const d = ds[p];
                return sum + (d.get || d.set ? 1 : 0);
            }, 0);
        const accessorsCount = props
            .reduce((sum, p) => {
                const d = ds[p];
                return sum + (d.get && d.set ? 2 : (d.get || d.set ? 1 : 0));
            }, 0);
        for (let i = 0; i < accessorsCount; ++i) {
            topFrame().expressionStack.pop();
        }
        const hasIndexProperty = props
            .some(p => {
                const pNum = parseInt(p);
                return (pNum !== NaN && pNum >= 0 && p === String(pNum));
            });
        const definesProto = (Object.getPrototypeOf(obj) !== Object.prototype);
        if (hasIndexProperty || definesProto) {
            let t = Taint.BOTTOM;
            for (let i = 0; i < dataPropsCount; ++i) {
                t = Taint.join(t, topFrame().expressionStack.pop());
            }
            if (definesProto) {
                t = Taint.join(t, topFrame().expressionStack.pop());
            }
            for (let p of props) {
                const d = ds[p];
                if (!d.get && !d.set) {
                    putPropertyTaint(obj, p, t);
                }
            }
        } else {
            for (let p of props) {
                const d = ds[p];
                if (!d.get && !d.set) {
                    putPropertyTaint(obj, p, topFrame().expressionStack.pop());
                }
            }
        }
    }

    function initArray(arr) {
        const indexes = Object.keys(arr).reverse();
        for (let i of indexes) {
            putPropertyTaint(arr, i, topFrame().expressionStack.pop());
        }
    }

    function initFunction(f) {
        f[$UserFunction] = true;
        f[$ScopeChain] = topFrame().scope;
    }

    const $FieldInsensitiveTaint = Symbol("$FieldInsensitiveTaint");

    function getFieldInsensitiveTaint(obj) {
        const ts = SHADOW_MEMORY.get(obj);
        return (ts ? (ts.get($FieldInsensitiveTaint) || Taint.BOTTOM) : Taint.BOTTOM);
    }

    function putFieldInsensitiveTaint(obj, t) {
        const ts = SHADOW_MEMORY.get(obj) || SHADOW_MEMORY.set(obj, new Map()).get(obj);
        ts.set($FieldInsensitiveTaint, Taint.join(ts.get($FieldInsensitiveTaint) || Taint.BOTTOM, t));
    }

    function deepTaint(obj, __visited__ = new WeakSet()) {
        if (__visited__.has(obj)) return Taint.BOTTOM;
        __visited__.add(obj);
        let t = getFieldInsensitiveTaint(obj);
        const ds = Object.getOwnPropertyDescriptors(obj);
        for (let k in ds) {
            if (ds[k].get || ds[k].set) continue;
            if (isObject(obj[k])) {
                t = Taint.join(t, deepTaint(obj[k], __visited__));
            }
        }
        return t;
    }

    function shallowTaint(obj) {
        return getFieldInsensitiveTaint(obj);
    }

    function deepPropagate(obj, t, __visited__ = new WeakSet()) {
        if (__visited__.has(obj)) return;
        __visited__.add(obj);
        putFieldInsensitiveTaint(obj, t);
        var ds = Object.getOwnPropertyDescriptors(obj);
        for (var k in ds) {
            if (ds[k].get || ds[k].set) continue;
            if (isObject(obj[k])) {
                deepPropagate(obj[k], t, __visited__);
            }
        }
    }

    function shallowPropagate(obj, t) {
        putFieldInsensitiveTaint(obj, t);
    }

    function MyAnalysis() {

        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            const tArgs = [];
            for (let i = 0; i < args.length; ++i) {
                tArgs.push(topFrame().expressionStack.pop());
            }
            tArgs.reverse();
            tArgs.forEach((_, i) => {
                if (isObject(args[i])) tArgs[i] = Taint.join(tArgs[i], shallowTaint(args[i]));
            });
            let tBase = Taint.BOTTOM;
            if (isMethod) {
                tBase = topFrame().expressionStack.pop();
                if (isObject(base)) tBase = shallowTaint(base);
            }
            if (isUserFunction(f)) {
                topFrame().calleeContext = makeOneByOneContext(tArgs);
            } else {
                topFrame().calleeContext = makeOneForAllWithFeedbackContext(Taint.join(tBase, ...tArgs));
            }
            invokeFunSinks(iid, f, base, tBase, args, tArgs, topFrame().calleeContext.retTaint);
        };

        function storageInstance(obj) {
            return (
                obj === global.localStorage ? "localStorage" : (
                    obj === global.sessionStorage ? "sessionStorage" : "unknown"));
        }

        function invokeFunSources(iid, f, base, args, result, tResult) {
            if (f === global.Storage.prototype.getItem) {
                const instance = storageInstance(base);
                const key = args[0];
                const val = result;
                return Taint.join(tResult, new Taint([new Label("[Storage].getItem()", iid, J$.sid, [instance, key, val])]));
            }
            return tResult;
        }

        function invokeFunSinks(iid, f, base, tBase, args, tArgs, tResultPre) {
            if (f === global.Storage.prototype.setItem) {
                const instance = storageInstance(base);
                const key = args[0];
                const val = args[1];
                sink(tArgs[1], new Label("[Storage].setItem()", iid, J$.sid, [instance, key, val]));
            } else if (base instanceof global.XMLHttpRequest) {
                if (f === global.XMLHttpRequest.prototype.open) {
                    base.method = args[0];
                    base.url = args[1];
                }
                sink(tResultPre, new Label("[XMLHttpRequest][f]()", iid, J$.sid, [base.method, base.url, f.name, ...args]));
            } else if (f === global.navigator.sendBeacon) {
                sink(tResultPre, new Label("navigator.sendBeacon()", iid, J$.sid, [...args]));
            } else if (f === global.Element.prototype.setAttribute) {
                sink(tResultPre, new Label("[Element].setAttribute()", iid, J$.sid, [base.localName, ...args]));
            }
        }

        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            let tResult = topFrame().calleeContext.retTaint;
            if (isObject(result)) {
                shallowPropagate(result, tResult);
                tResult = Taint.BOTTOM;
            }
            tResult = invokeFunSources(iid, f, base, args, result, tResult);
            topFrame().expressionStack.push(tResult);
            topFrame().calleeContext = BOTTOM_CONTEXT;
        };

        this.literal = function (iid, val, hasGetterSetter) {
            if (isFunction(val)) {
                initFunction(val);
            } else if (isObjectLiteral(val)) {
                initObjectLiteral(val);
            } else if (isArray(val)) {
                initArray(val);
            }
            topFrame().expressionStack.push(Taint.BOTTOM);
        };

        this.forinObject = function (iid, val) {
            topFrame().expressionStack.pop();
        };

        this.declare = function (iid, name, val, isArgument, argumentIndex, isCatchParam) {
            if (isArgument) {
                if (argumentIndex === -1) {
                    const args = val;
                    for (let i = 0; i < args.length; ++i) {
                        putPropertyTaint(args, i, topFrame().context.argTaint(i));
                    }
                } else {
                    declareVariable(topFrame().scope, name, topFrame().context.argTaint(argumentIndex));
                }
            } else if (isCatchParam) {
                topFrame().expressionStack.length = 0;
                declareVariable(topFrame().scope, Taint.BOTTOM);
            } else {
                const tVal = topFrame().expressionStack.pop() || Taint.BOTTOM;
                declareVariable(topFrame().scope, name, tVal);
            }
        };

        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            if (isComputed) topFrame().expressionStack.pop();
            const tBase = topFrame().expressionStack.pop();
            topFrame().calleeContext = makeOneByOneContext([], Taint.join(tBase, getPropertyTaint(base, offset)));
            getFieldSinks(iid, base, tBase, offset, topFrame().calleeContext.retTaint);
            if (isOpAssign) {
                topFrame().expressionStack.push(tBase);
                if (isComputed) topFrame().expressionStack.push(Taint.BOTTOM);
            }
        };

        function getFieldSources(iid, base, offset, val, tVal) {
            if (base instanceof global.Storage) {
                const instance = storageInstance(base);
                const key = offset;
                return Taint.join(tVal, new Taint([
                    new Label("[Storage][p]", iid, J$.sid, [instance, key, val])
                ]));
            } else if (base === global.document && offset === "cookie") {
                return Taint.join(tVal, new Taint([
                    new Label("document.cookie", iid, J$.sid, [val])
                ]));
            } else if (base instanceof global.Element) {
                return Taint.join(tVal, new Taint([
                    new Label("[Element][p]", iid, J$.sid, [base.localName, offset, val])
                ]));
            } else if (base instanceof global.XMLHttpRequest && (offset === "response" || offset === "responseText" || offset === "responseURL" || offset === "responseXML")) {
                return Taint.join(tVal, new Taint([
                    new Label("[XMLHttpRequest].response", iid, J$.sid, [base.method, base.url, offset, val])
                ]));
            } else if (base === global.navigator && isPrimitive(val)) {
                return Taint.join(tVal, new Taint([
                    new Label("navigator[p]", iid, J$.sid, [offset, val])
                ]));
            } else if (base === global && offset === "location") {
                return Taint.join(tVal, new Taint([
                    new Label("location", iid, J$.sid, ["window.location", val])
                ]));
            } else if (base === global.document && offset === "location") {
                return Taint.join(tVal, new Taint([
                    new Label("location", iid, J$.sid, ["document.location", val])
                ]));
            } else if (base === global.document && offset === "URL") {
                return Taint.join(tVal, new Taint([
                    new Label("location", iid, J$.sid, ["document.URL", val])
                ]));
            }
            return tVal;
        }

        function getFieldSinks(iid, base, tBase, offset, tResultPre) {
        }

        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            let tVal = topFrame().calleeContext.retTaint;
            tVal = getFieldSources(iid, base, offset, val, tVal);
            topFrame().expressionStack.push(tVal);
            topFrame().calleeContext = BOTTOM_CONTEXT;
        };

        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            const tVal = topFrame().expressionStack.pop();
            if (isComputed) topFrame().expressionStack.pop();
            const tBase = topFrame().expressionStack.pop();
            topFrame().calleeContext = makeOneByOneContext([tVal], tVal);
            putFieldSinks(iid, base, tBase, offset, val, topFrame().calleeContext.retTaint);
        };

        function putFieldSources(iid, base, offset, val, tVal) {
            return tVal;
        }

        function putFieldSinks(iid, base, tBase, offset, val, tResultPre) {
            if (base instanceof global.Storage) {
                const instance = storageInstance(base);
                const key = offset;
                sink(tResultPre, new Label("[Storage][p]", iid, J$.sid, [instance, key, val]));
            } else if (base === global.document && offset === "cookie") {
                sink(tResultPre, new Label("document.cookie", iid, J$.sid, [val]));
            } else if (base instanceof global.Element) {
                sink(tResultPre, new Label("[Element][p]", iid, J$.sid, [base.localName, offset, val]));
            } else if (base === global && offset === "location") {
                sink(tResultPre, new Label("location", iid, J$.sid, ["window.location", val]));
            } else if (base === global.document && offset === "location") {
                sink(tResultPre, new Label("location", iid, J$.sid, ["document.location", val]));
            } else if (base === global.document && offset === "URL") {
                sink(tResultPre, new Label("location", iid, J$.sid, ["document.URL", val]));
            }
        }

        this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
            let tVal = topFrame().calleeContext.retTaint;
            tVal = putFieldSources(iid, base, offset, val, tVal);
            topFrame().calleeContext = BOTTOM_CONTEXT;
            topFrame().expressionStack.push(tVal);
            putPropertyTaint(base, offset, tVal);
        };

        this.read = function (iid, name, val, isGlobal, isScriptLocal) {
            const tVal = getVariableTaint(topFrame().scope, name);
            topFrame().expressionStack.push(tVal);
        };

        this.write = function (iid, name, val, previousVal, isGlobal, isScriptLocal) {
            const tVal = topFrame().expressionStack.pop() || Taint.BOTTOM;
            putVariableTaint(topFrame().scope, name, tVal);
            topFrame().expressionStack.push(tVal);
        };

        this._return = function (iid, val) {
            topFrame().context.retTaint = topFrame().expressionStack.pop() || Taint.BOTTOM;
        };

        // this._throw = function (iid, val) {};

        // this._with = function (iid, val) {};

        this.functionEnter = function (iid, f, self, args) {
            const calleeContext = topFrame().calleeContext;
            FRAME_STACK.push(new Frame(new Scope(f[$ScopeChain]), calleeContext));
        };

        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {
            FRAME_STACK.pop();
        };

        this.binaryPre = function (iid, op, left, right, isOpAssign, isSwitchCaseComparison, isComputed) {
            const tRhs = (op !== "delete" || isComputed ? topFrame().expressionStack.pop() : Taint.BOTTOM);
            const tLhs = (!isSwitchCaseComparison ? topFrame().expressionStack.pop() : Taint.BOTTOM);
            topFrame().calleeContext = makeOneByOneContext([], Taint.join(tLhs, tRhs));
        };

        this.binary = function (iid, op, left, right, result, isOpAssign, isSwitchCaseComparison, isComputed) {
            topFrame().expressionStack.push(topFrame().calleeContext.retTaint);
            topFrame().calleeContext = BOTTOM_CONTEXT;
            if (op === "delete" && result) {
                deletePropertyTaint(left, right);
            }
        };

        this.unaryPre = function (iid, op, val) {
            const tVal = topFrame().expressionStack.pop();
            topFrame().calleeContext = makeOneByOneContext([], tVal);
        };

        this.unary = function (iid, op, val, result) {
            topFrame().expressionStack.push(topFrame().calleeContext.retTaint);
            topFrame().calleeContext = BOTTOM_CONTEXT;
        };

        // this.conditional = function (iid, result) {};

        this.endExpression = function (iid) {
            topFrame().expressionStack.pop();
        };

        // this.endExecution = function () {};
    }

    J$.analysis = new MyAnalysis();
})(J$);
