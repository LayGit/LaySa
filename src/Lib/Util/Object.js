var Object = {};

//对象和数组的深拷贝
Object.clone = function(sObj){
    if(typeof sObj !== "object"){
        return sObj;
    }
    var s = {};
    if(sObj.constructor == Array){
        s = [];
    }
    for(var i in sObj){
        s[i] = Object.clone(sObj[i]);
    }
    return s;
};

//对象扩展，tObj被扩展对象，sObj扩展对象
Object.extend = function(tObj,sObj){
    for(var i in sObj){
        if(typeof sObj[i] !== "object"){
            if (!tObj[i])
                tObj[i] = sObj[i];
        }else if (sObj[i].constructor == Array){
            if (!tObj[i])
                tObj[i] = Object.clone(sObj[i]);
        }else{
            tObj[i] = tObj[i] || {};
            Object.extend(tObj[i],sObj[i]);
        }
    }
};

exports.extend = Object.extend;
exports.clone = Object.clone;