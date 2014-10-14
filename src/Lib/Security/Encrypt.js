var crypto = require("crypto");

var encrypt = function(hashMode, str, isUpperCase, times)
{
    var rs = crypto.createHash(hashMode).update(str).digest('hex');
    rs = isUpperCase ? rs.toUpperCase() : rs;

    if (times && times > 0)
    {
        for (var i= 0;i < times; i++)
            rs = encrypt(hashMode, str, isUpperCase);
    }

    return rs;
}

var md5 = function(str, isUpperCase, times){
    return encrypt('md5', str, isUpperCase, times);
};

var sha1 = function(str, isUpperCase, times){
    return encrypt('sha1', str, isUpperCase, times);
};

exports.do = encrypt;
exports.md5 = md5;
exports.sha1 = sha1;