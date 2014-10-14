var http = require("http");
var https = require("https");
var vm = require("vm");
var journey = require("journey");
var fs = require("fs");
var path = require("path");
var Howdo = require("howdo");
var MySql = require("./Lib/Data/MySql").Instance;
var dateFormat = require("./Lib/Util/DateFormat").format;
var object = require("./Lib/Util/Object");
var logger = require("tracer");
(function(){
    // 声明全局Lay对象
    var Lay = this.Lay = {
        Config:{}
    };

    // 模型缓存
    var modelCache = Lay.Model = {};

    function isType(type) {
        return function(obj) {
            return {}.toString.call(obj) == "[object " + type + "]";
        };
    }
    var isFunction = isType("Function"),
        isString = isType("String");

    Lay.logger = logger.colorConsole();

    /**
     * 引用Lay类库模块
     * @param ns    命名空间路径 '/' to '.'
     * @returns {*}
     */
    Lay.using = function(ns){
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
    Lay.include = function(_module){
        try{
            return require(_module);
        }
        catch (e){
            return require(getRealPath(_module));
        }
    };

    /**
     * 获取相对于项目根路径的真实路径
     * @returns {string}
     */
    var getRealPath = Lay.getRealPath = function()
    {
        return path.join(Lay.Config.path.root, path.join.apply(this, arguments));
    };

    /**
     * 获取项目配置文件
     * @type {getConfig}
     */
    var getConfig = Lay.getConfig = function(confName)
    {
        confName = /\.json$/.test(confName.toLowerCase()) ? confName : confName + ".json";
        var _confPath = getRealPath(Lay.Config.path.conf, confName);
        try
        {
            return JSON.parse(fs.readFileSync(_confPath, 'utf-8'));
        }
        catch (e)
        {
            Lay.logger.warn("配置文件载入失败:" + _confPath);
        }
    };

    /**
     * 输出类型
     * @type {{JSON: number, XML: number, TEXT: number, HTML: number, CSS: number}}
     */
    Lay.OutType = {
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
    Lay.out = function(result, type, charset){
        if (Lay.http.response)
        {
            var _header = {"Content-Type":"text/plain"};
            if (type)
            {
                switch (type)
                {
                    case Lay.OutType.JSON:
                        result = JSON.stringify(result);
                        _header["Content-Type"] = "application/json";
                        break;
                    case Lay.OutType.XML:
                        _header["Content-Type"] = "text/xml";
                        break;
                    case Lay.OutType.HTML:
                        _header["Content-Type"] = "text/html";
                        break;
                    case Lay.OutType.CSS:
                        _header["Content-Type"] = "text/css'";
                        break;
                }
            }

            charset = charset ? charset : "UTF-8";
            _header["Content-Type"] += ";charset=" + charset;

            Lay.http.response.send(200, _header, result);
        }
    };

    /**
     * CDM输出
     * @param code
     * @param data
     * @param message
     */
    Lay.outCDM = function(code, data, message, charset){
        Lay.out({
            code: code,
            data: data,
            message: message
        }, Lay.OutType.JSON, charset);
    };

    /**
     * 接口申明函数
     * @param method    调用方法 GET/POST
     * @param intercept 拦截器
     * @param handler   处理函数
     */
    Lay.interface = function(method, interceptor, handler){
        if (arguments.length == 1 && isFunction(method))
        {
            handler = method;
            method = Lay.PostMethod.BOTH;
        }
        else if (arguments.length == 2 && isFunction(interceptor))
        {
            handler = interceptor;
            interceptor = null;
        }

        if (method == Lay.PostMethod.BOTH)
            execute();
        else if (method == Lay.http.method)
            execute();
        else
            Lay.out({message:"错误的请求"});

        function execute()
        {
            var _arrInterceptors,
                _iPath = getRealPath(Lay.Config.path.interceptor);
            // 分析拦截器
            if(interceptor)
            {
                if (isString(interceptor))
                    _arrInterceptors = [interceptor];
                else
                    _arrInterceptors = interceptor;
            }

            Howdo.each(_arrInterceptors, function(key, val, next, data){
                var _fPath = path.join(_iPath, val + ".js");
                fs.exists(_fPath, function(exsist){
                    if (exsist)
                    {
                        var _done = function(){
                            next(null, true);
                        };
                        fs.readFile(_fPath, function(err, data){
                            var sandbox = {
                                Lay: Lay,
                                Done:_done
                            };
                            // 进入沙箱执行
                            vm.runInNewContext(data, sandbox, 'myfile.vm');
                        });
                    }
                    else
                    {
                        Lay.logger.warn("未找到拦截器文件:" + _fPath);
                        Lay.out({message:"内部错误"});
                    }
                });
            }).follow(function(err){
                if (!err)
                {
                    handler(Lay.http.params, Lay.http.method);
                }
            });
        }
    };

    Lay.Interceptor = function(handler){
        handler(Lay.http.params, Lay.http.method);
    };

    Lay.PostMethod = {
        GET:0,
        POST:1,
        BOTH:2
    };

    function bindRequest(config, method, req, res, params){
        var urlPath = this.request.url.pathname;

        Lay.logger.info("收到请求:" + urlPath + " | 参数:" + JSON.stringify(params));

        Lay.http = {
            request:req,
            response:res,
            method:method,
            params:params
        };

        if (urlPath.indexOf('.') > -1)
        {
            Lay.logger.warn("错误的接口地址:" + urlPath);
            Lay.out({message:"错误的请求"});
            return;
        }
        var infPath = path.join(config.path.root, config.path.controller, urlPath + ".js");

        // 传入的沙箱对象
        var sandbox = {
            Lay: Lay
        };

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
                Lay.logger.warn("未找到接口文件:" + infPath);
                Lay.out({message:"错误的请求"});
            }
        });
    }

    Lay.getConn = function (dbconf, dbname)
    {
        var _db;
        if (isString(dbconf))
            _db = getConfig(dbconf);
        else
            _db = dbconf;
        return new MySql(_db[dbname]);
    };

    Lay.server = function(config){

        var _config = {
            port:8080,
            path:{
                // 根路径
                root:path.dirname(module.parent.filename),
                // 配置文件
                conf:"config",
                // 接口
                controller:"controller",
                // 拦截器
                interceptor:"interceptor",
                // 监听路径路由
                routerMap:/\/(\w*\W*\w*)*/
            }
        };

        object.extend(config, _config);
        Lay.Config = config;

        if (config.path.log)
        {
            Lay.logger = logger.colorConsole({
                transport:function(data){
                    console.log(data.output);
                    var _logPath = getRealPath(config.path.log);
                    var _today = new Date(),
                        _fileName = dateFormat(_today, "yyyyMMdd") + "." + data.title + ".log",
                        output = data.timestamp + " <" + data.title + "," + data.level + "> " + data.file + ":" + data.line + ":" + data.pos + " | " + data.message;

                    fs.open(path.join(_logPath, _fileName), 'a', 0666, function(e, id) {
                        fs.write(id, output+"\n", null, 'utf8', function() {
                            fs.close(id, function() {
                            });
                        });
                    });
                }
            });
        }


        Howdo.task(function(done){
            // 配置监测
            Lay.logger.debug("项目配置检测...");


            var _confPath = getRealPath(config.path.conf),
                _incptPath = getRealPath(config.path.interceptor),
                _ctrlPath = getRealPath(config.path.controller);

            // 配置文件
            if (_confPath)
            {
                Lay.logger.debug("检查配置文件目录...");
                if (fs.existsSync(_confPath))
                {
                    Lay.logger.debug("配置文件目录正常,数量:" + fs.readdirSync(_confPath).length);
                }
                else
                {
                    Lay.logger.warn("配置文件目录不存在！");
                }
            }

            // 拦截器
            if (_incptPath)
            {
                if (fs.existsSync(_incptPath))
                {
                    Lay.logger.debug("拦截器文件目录正常,数量:" + fs.readdirSync(_incptPath).length);
                }
                else
                {
                    Lay.logger.warn("拦截器文件目录不存在！");
                }
            }

            // 接口
            if (_ctrlPath)
            {
                if (fs.existsSync(_ctrlPath))
                {
                    Lay.logger.debug("接口文件目录正常,数量:" + fs.readdirSync(_ctrlPath).length);
                }
                else
                {
                    Lay.logger.warn("接口文件目录不存在！");
                }
            }

            Lay.logger.debug("项目配置检测完毕！");
            done(null);

        }).together(function(err){
            Lay.logger.debug("创建监听服务...");
            // 创建路径路由
            var router = new(journey.Router);

            if (isFunction(config.routerMap))
                router.map(config.routerMap);
            else
            {
                router.map(function(){
                    this.get(config.routerMap).bind(function(req, res, params){
                        bindRequest.apply(this, [config,Lay.PostMethod.GET, req, res, params]);
                    });

                    this.post(config.routerMap).bind(function(req, res, params){
                        bindRequest.apply(this, [config,Lay.PostMethod.POST, req, res, params]);
                    });
                });
            }

            //ssl
            var _server,
                _tip,
                _handler = function(req, res){
                    var body = "";
                    req.addListener('data', function(chunk){
                        body += chunk;
                    });
                    req.addListener('end', function(){
                        router.handle(req, body, function(result){
                            res.writeHead(result.status, result.headers);
                            res.end(result.body);
                        });
                    });
                };

            if (config.ssl)
            {
                config.ssl.key = fs.readFileSync(getRealPath(config.ssl.key));
                config.ssl.cert = fs.readFileSync(getRealPath(config.ssl.cert));
                _server = https.createServer(config.ssl, _handler);
                _tip = "(https)";
            }
            else
            {
                _server = http.createServer(_handler);
                _tip = "(http)";
            }

            // 启动服务
            config.host ? _server.listen(config.port, config.host) : _server.listen(config.port);
            Lay.logger.debug(_tip + "服务启动成功 " + _server.address().address + ":" + config.port);
        });
    };
})();