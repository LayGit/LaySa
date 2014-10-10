var vm = require('vm');
var fs = require('fs');
exports.run = function(fileOrData, params, error, vName){
    vName = vName || 'myfile.vm';
    if (Object.prototype.toString.call(fileOrData) === "[object String]")
    {
        fs.exists(fileOrData, function(exsist){
            if (exsist)
            {
                fs.readFile(fileOrData, function(err, data){
                    if (err){
                        error(err);
                        return;
                    }

                    // 进入沙箱执行
                    vm.runInNewContext(data, params, vName);
                });
            }
            else
            {
                error ? error("File not found:" + fileOrData) : 0;
            }
        });
    }
    else
    {
        vm.runInNewContext(fileOrData, params, vName);
    }
};