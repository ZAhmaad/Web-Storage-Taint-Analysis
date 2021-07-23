(function (sandbox) {
 
    /**
     * Shadow object class
     */
  
  
    function Shadow(x) {
        this.val = x;
    }
 
    Shadow.asShadow = function(x) {
        if (Shadow.isShadowed(x)) {
            return x;
        } else {
            return new Shadow(x);
        }
    }
 
    Shadow.getVal = function(v) {
        return Shadow.isShadowed(v) ? v.val : v;
    }
 
    Shadow.isShadowed = function(x) {
        return x instanceof Shadow;
    }
 
    Shadow.toString = function() {
        return 'Shadow(' + this.val + ')';
    }
 
    /**
     * End shadow object class
     */
 
    function StorageTaint() {

        taintconditions = [];
 
        this._taintStack = [];
        
 
        this.invokeFunPre = function (iid, f, base, args, isConstructor, isMethod, functionIid, functionSid) {
            
            let isStorageTainted = false;
 
            if (Shadow.isShadowed(f)) {
                f = Shadow.getVal(f);
                isStorageTainted = true;
                // taintconditions.push(J$.getGlobalIID(iid));
            }
 
            if (Shadow.isShadowed(base)) {
                base = Shadow.getVal(base);
                isStorageTainted = true;
                // taintconditions.push(J$.getGlobalIID(iid));
            }


            this._taintStack.push(isStorageTainted);
 
            return {f: f, base: base, args: args, skip: false};

        };
 
        this.invokeFun = function (iid, f, base, args, result, isConstructor, isMethod, functionIid, functionSid) {
            
            if (this._taintStack.pop()) {
                result = Shadow.asShadow(result);
                taintconditions.push(J$.getGlobalIID(iid));
            }
            
            if (f.name == "taint" ) {
                result = Shadow.asShadow(result);
                 taintconditions.push(J$.getGlobalIID(iid));
            } else if (f.name == "isTaint") {
                result = Shadow.isShadowed(result);
                // taintconditions.push(J$.getGlobalIID(iid));
            }

 
            return {result: result};
        };
        
     
        
        this.functionEnter = function (iid, f, dis, args) {
            let isTainted = false;
 
            let n_args = [];

            let tainteds = [];
 
             for(let i = 0; i < args.length; i++) {
                 if (Shadow.isShadowed(args[i])) {
                     n_args.push(Shadow.getVal(args[i]));
                     isTainted = true;
 
                     tainteds.push(args[i]);
                     // taintconditions.push(J$.getGlobalIID(iid));
                 } else {
                    tainteds.push(false);
 
                     n_args.push(args[i]);
                 }
             }
 
             isTainted = true;
 
             for(let i = 0; i < tainteds.length; i++) {
                 if (!tainteds[i]) {
                     
                     //isStorageTainted = false;
                     isTainted = false;
                     break;
                      
                 } 
             }
  
             this._taintStack.push(isTainted);
  
             return { args: n_args, skip: false};
         };


        this.functionExit = function (iid, returnVal, wrappedExceptionVal) {
            if (this._taintStack.pop()) {
                returnVal = Shadow.asShadow(returnVal);
                taintconditions.push(J$.getGlobalIID(iid));
            }

            return {returnVal: returnVal};
        };



        this.getFieldPre = function (iid, base, offset, isComputed, isOpAssign, isMethodCall) {
            let toTaintStorage = Shadow.isShadowed(base) || Shadow.isShadowed(offset);
            this._taintStack.push(toTaintStorage);
 
            base = Shadow.getVal(base);
            offset = Shadow.getVal(offset);
            
            return {
                base: base,
                offset: offset, 
                skip: false 
            };
        };

 
        this.getField = function (iid, base, offset, val, isComputed, isOpAssign, isMethodCall) {
            
            if (this._taintStack.pop()) {
                val = Shadow.asShadow(val);
                taintconditions.push(J$.getGlobalIID(iid));
            }
 
            return {result: val};
        };

 
        this.putFieldPre = function (iid, base, offset, val, isComputed, isOpAssign) {
            base = Shadow.getVal(base);
            offset = Shadow.getVal(offset);
            return {base: base, offset: offset, val: val, skip: false};
        };

 
       this.putField = function (iid, base, offset, val, isComputed, isOpAssign) {
           return {result: val};
       };
 
 
        this.binaryPre = function (iid, op, left, right, isOpAssign, isSwitchCaseComparison, isComputed) {
            
            let taint = Shadow.isShadowed(left) || Shadow.isShadowed(right);
            this._taintStack.push(taint);
            left = Shadow.getVal(left);
            right = Shadow.getVal(right);
            
            return {op: op, left: left, right: right, skip: false};
        };

 
        this.binary = function (iid, op, left, right, result, isOpAssign, isSwitchCaseComparison, isComputed) {
            
            if (this._taintStack.pop()) {
                result = Shadow.asShadow(result);
                taintconditions.push(J$.getGlobalIID(iid));
            }
 
            return {result: result};
        };

 
        this.unaryPre = function (iid, op, left) {
            this._taintStack.push(Shadow.isShadowed(left));
            left = Shadow.getVal(left);
            return {op: op, left: left, skip: false};
        };

 
        this.unary = function (iid, op, left, result) {
            
            if (this._taintStack.pop()) {
                result = Shadow.asShadow(result);
                taintconditions.push(J$.getGlobalIID(iid));
            }
 
            return {result: result};
        };

        this.write = function (iid, name, val, lhs, isGlobal, isScriptLocal) {
            return {result: val};
        };
 
 
        this.endExecution = function () {
            for (var i = 0; i < taintconditions.length; i++)
                sandbox.log("Taint at  " + J$.iidToLocation(taintconditions[i]));
        };  
        
    };
                    
    
 
    sandbox.analysis = new StorageTaint();
})(J$);