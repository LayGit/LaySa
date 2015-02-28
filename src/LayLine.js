var path = require("path");
var fs = require("fs");
var vm = require("vm");
var Howdo = require("howdo");
var MySql = require("./Lib/Data/MySql").Instance;
var Request = require("./Lib/Network/Request");
exports.Instance = (function(){
    /**
     * 实例构造
     * @param config    配置
     * @param http      请求参数
     * @param logger    日志
     * @constructor
     */
    var Lay = function(config, http, logger){
        this.Config = config;
        this.http = http;
        this.logger = logger;

        // 绑定请求
        var urlPath = http.request.url.pathname;

        logger.info("收到请求:" + urlPath + " | 参数:" + JSON.stringify(http.params));

        if (urlPath.indexOf('.') > -1)
        {
            logger.warn("错误的接口地址:" + urlPath);
            this.out({message:"错误的请求"});
            return;
        }
        var infPath = path.join(config.path.root, config.path.controller, urlPath + ".js");

        // 传入的沙箱对象
        var sandbox = {
            Lay: this
        };

        var that = this;
        fs.exists(infPath, function(exsist){
            if (exsist)
            {
                fs.readFile(infPath, function(err, data){
                    // 进入沙箱执行
                    vm.runInNewContext(data, sandbox, 'myfile.vm');
                });
            }
            else
            {
                logger.warn("未找到接口文件:" + infPath);
                that.out({message:"错误的请求"});
            }
        });
    };

    /**
     * 引用Lay类库模块
     * @param ns    命名空间路径 '/' to '.'
     * @returns {*}
     */
    Lay.prototype.using = function(ns){
        ns = ns.replace(/\./g, '/');
        if (!/.\.js$/.test(ns))
            ns += ".js";
        return require(path.join(__dirname, 'Lib', ns));
    };

    /**
     * 引用相对于项目根路径的模块
     * @param _module
     * @returns {*}
     */
    Lay.prototype.include = function(_module){
        try{
            return require(_module);
        }
        catch (e){
            return require(this.getRealPath(_module));
        }
    };

    /**
     * 请求内部接口
     * @param method    请求方式
     * @param infPath   接口路径
     * @param data      数据
     * @param success   成功回调
     * @param dataType  数据类型
     */
    Lay.prototype.request = function(method, infPath, data, success, dataType){
        switch (method)
        {
            case this.CallType.GET:
            case this.CallType.BOTH:
                method = "GET";
                break;
            case this.CallType.POST:
                method = "POST";
                break;
        }

        // 拼接URL
        var url = "";
        var conf = this.Config;
        url += conf.ssl ? "https://" : "http://";
        url += "localhost";
        url += conf.port ? ":" + conf.port : "";
        url += infPath.charAt(0) == '/' ? "" : "/";
        url += infPath;
        Request.do({
            type:method,
            url:url,
            data:data,
            success:success,
            dataType:dataType
        });
    };

    /**
     * 输出类型
     * @type {{JSON: number, XML: number, TEXT: number, HTML: number, CSS: number}}
     */
    Lay.prototype.OutType = {
        JSON:0,
        XML:1,
        TEXT:2,
        HTML:3,
        CSS:4
    };

    /**
     * 标准输出
     * @param result    结果
     * @param type      结果类型 Lay.OutType
     * @param charset   编码 默认UTF-8
     */
    Lay.prototype.out = function(result, type, charset){
        if (this.http.response)
        {
            var _header = {"Content-Type":"text/plain"};
            if (type)
            {
                switch (type)
                {
                    case this.OutType.JSON:
                        result = JSON.stringify(result);
                        _header["Content-Type"] = "application/json";
                        break;
                    case this.OutType.XML:
                        _header["Content-Type"] = "text/xml";
                        break;
                    case this.OutType.HTML:
                        _header["Content-Type"] = "text/html";
                        break;
                    case this.OutType.CSS:
                        _header["Content-Type"] = "text/css'";
                        break;
                }
            }

            charset = charset ? charset : "UTF-8";
            _header["Content-Type"] += ";charset=" + charset;

            this.http.response.send(200, _header, result);
        }
    };

    /**
     * CDM输出
     * @param code      错误代码
     * @param data      返回结果
     * @param message   消息提示
     * @param charset   编码格式
     */
    Lay.prototype.outCDM = function(code, data, message, charset){
        this.out({
            code: code,
            data: data,
            message: message
        }, this.OutType.JSON, charset);
    };

    /**
     * 接口请求类型
     * @type {{GET: number, POST: number, BOTH: number, PUT: number, DELETE: number, ALL: number}}
     */
    Lay.prototype.CallType = {
        GET:0,
        POST:1,
        BOTH:2,
        PUT:3,
        DELETE:4,
        ALL:5
    };

    /**
     * 接口申明函数
     * @param method    调用方法
     * @param intercept 拦截器
     * @param handler   处理函数
     */
    Lay.prototype.interface = function(method, interceptor, handler){
        var that = this;

        if (arguments.length == 1 && isFunction(method))
        {
            handler = method;
            method = that.CallType.ALL;
        }
        else if (arguments.length == 2 && isFunction(interceptor))
        {
            handler = interceptor;
            interceptor = null;
        }

        if (method == that.CallType.ALL)
            execute();
        else if (method == that.http.calltype)
            execute();
        else if ((that.http.calltype == that.CallType.GET || that.http.calltype == that.CallType.POST) && method == that.CallType.BOTH)
            execute();
        else
            this.out({message:"错误的请求"});

        function execute()
        {
            var _arrInterceptors,
                _iPath = that.getRealPath(that.Config.path.interceptor);
            // 分析拦截器
            if(interceptor)
            {
                if (isString(interceptor))
                    _arrInterceptors = [interceptor];
                else
                    _arrInterceptors = interceptor;

                Howdo.each(_arrInterceptors, function(key, val, next, data){
                    var _fPath = path.join(_iPath, val + ".js");
                    fs.exists(_fPath, function(exsist){
                        if (exsist)
                        {
                            var _done = function(param){
                                if (param)
                                    that.http.params = param;
                                next(null, true);
                            };
                            fs.readFile(_fPath, function(err, data){
                                var sandbox = {
                                    Lay: that,
                                    Done:_done
                                };
                                // 进入沙箱执行
                                vm.runInNewContext(data, sandbox, 'myfile.vm');
                            });
                        }
                        else
                        {
                            that.logger.warn("未找到拦截器文件:" + _fPath);
                            that.out({message:"内部错误"});
                        }
                    });
                }).follow(function(err){
                    if (!err)
                    {
                        handler.apply({}, [that.http.params, that.http.calltype]);
                    }
                });
            }
            else
                handler.apply({}, [that.http.params, that.http.calltype]);
        }
    };

    /**
     * 拦截器
     * @param handler
     */
    Lay.prototype.interceptor = function(handler){
        handler.apply({}, [this.http.params, this.http.calltype]);
    };

    /**
     * 获取项目配置文件
     * @type {getConfig}
     */
    Lay.prototype.getConfig = function(confName)
    {
        confName = /\.json$/.test(confName.toLowerCase()) ? confName : confName + ".json";
        var _confPath = this.getRealPath(this.Config.path.conf, confName);
        try
        {
            return JSON.parse(fs.readFileSync(_confPath, 'utf-8'));
        }
        catch (e)
        {
            this.logger.warn("配置文件载入失败:" + _confPath);
        }
    };

    /**
     * 获取数据库连接
     * @param dbconf
     * @param dbname
     * @returns {MySql}
     */
    Lay.prototype.getConn = function (dbconf, dbname)
    {
        var _db;
        if (isString(dbconf))
            _db = this.getConfig(dbconf);
        else
            _db = dbconf;

        var _conf = _db[dbname];
        if (this.logger)
            _conf.logger = this.logger;

        return new MySql(dbconf + "_" + dbname, _conf);
    };

    /**
     * 获取相对于项目根路径的真实路径
     * @returns {string}
     */
    Lay.prototype.getRealPath = function(){
        return path.join(this.Config.path.root, path.join.apply(this, arguments));
    };

    /**
     * Buffer
     * @param val
     * @param type
     * @returns {Buffer}
     */
    Lay.prototype.getBuffer = function(val, type)
    {
        type = type || 'base64';
        return new Buffer(val, type);
    };

    /**
     * 获取客户端IP
     * @returns {*}
     */
    Lay.prototype.getClientIp = function(){
        var req = this.http.request;
        return req.headers['x-forwarded-for'] ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.connection.socket.remoteAddress;
    };

    function isType(type) {
        return function(obj) {
            return {}.toString.call(obj) == "[object " + type + "]";
        };
    }
    var isFunction = isType("Function"),
        isString = isType("String");

    return Lay;
})();