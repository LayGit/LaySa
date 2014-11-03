var crypto = require('crypto');

var encrypt = function(data, key, algorithm, clearEncoding, cipherEncoding){
    algorithm = algorithm || 'aes-128-ecb';
    clearEncoding = clearEncoding || 'utf8';
    cipherEncoding = cipherEncoding || 'base64';
    var cipher = crypto.createCipher(algorithm, key);
    var cipherChunks = [];
    cipherChunks.push(cipher.update(data, clearEncoding, cipherEncoding));
    cipherChunks.push(cipher.final(cipherEncoding));
    return cipherChunks.join('');
};

var decrypt = function(data, key, algorithm, clearEncoding, cipherEncoding){
    algorithm = algorithm || 'aes-128-ecb';
    clearEncoding = clearEncoding || 'utf8';
    cipherEncoding = cipherEncoding || 'base64';
    var cipherChunks = ['', data];
    var decipher = crypto.createDecipher(algorithm, key);
    var plainChunks = [];
    for (var i = 0;i < cipherChunks.length;i++) {
        plainChunks.push(decipher.update(cipherChunks[i], cipherEncoding, clearEncoding));

    }
    plainChunks.push(decipher.final(clearEncoding));
    return plainChunks.join('');
};

exports.encrypt = encrypt;
exports.decrypt = decrypt;