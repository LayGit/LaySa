var http = require("http");
var https = require("https");

function json2querystr(data)
{
    var querystr = "";
    for (var key in data)
    {
        if (querystr != "")
            querystr += "&";
        querystr += key + "=" + data[key];
    }
    return querystr;
}


function run(config){
    // 分析url
    var regex = /([a-zA-Z]+):\/\/([\.A-Za-z0-9_-]+):?([0-9]+)?([\/\.A-Za-z0-9_-]+)?/;
    var matched = config.url.match(regex);
    var isHttps = false;

    config.success = config.success || function(){};
    config.error = config.error || function(){};
    config.type = (config.type || 'GET').toUpperCase();
    config.charset = config.charset || 'utf-8';

    if (matched[1] == 'https')
        isHttps = true;

    var option = {
        hostname:matched[2],
        port:matched[3] || (isHttps ? 443 : 80),
        path:matched[4] || '/',
        method:config.type,
        headers:config.headers || {}
    };

    var data = json2querystr(config.data);

    if (option.method == "GET" && data)
    {
        option.path += "?" + data;
    }

    var _resHandler = function(res){
        res.setEncoding(config.charset);
        res.on('data', function(rs){
            config.success(rs);
        });
    };

    var req = isHttps ? https.request(option, _resHandler) : http.request(option, _resHandler);

    req.on('error', function(e){
        console.log(e);
    });
    if (option.method == "POST")
        req.write(data);
    req.end();
}

function get(url, data, success, dataType){
    run({
        type:"GET",
        url:url,
        data:data,
        success:success,
        dataType:dataType
    });
}

function post(url, data, success, dataType){
    run({
        type:"POST",
        url:url,
        data:data,
        success:success,
        dataType:dataType
    });
}

exports.do = run;
exports.get = get;
exports.post = post;