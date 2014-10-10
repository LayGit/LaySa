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

    Lay.using = function(module){
        module = module.replace(/\./g, '/');
        if (!/.\.js$/.test(module))
            module += ".js";
        return require(path.join(__dirname, 'Lib', module));
    };

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
     * @param path        相对路径
     * @returns {string}
     */
    var getRealPath = Lay.getRealPath = function(rPath)
    {
        return path.join(Lay.Config.path.root, rPath);
    };

    Lay.OutType = {
        JSON:0,
        XML:1,
        TEXT:2,
        HTML:3
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

    function getJSON(filePath, callback)
    {
        fs.exists(filePath, function(exsist){
            if (exsist)
            {
                fs.readFile(filePath, function(err, data){
                    callback(JSON.parse(data), err);
                });
            }
            else
            {
                callback(null, "文件不存在");
            }
        });
    }

    Lay.getConn = function (dbname)
    {
        return new MySql(Lay.Config.Database[dbname]);
    };

    Lay.server = function(config){

        var _config = {
            port:8080,
            path:{
                // 根路径
                root:path.dirname(module.parent.filename),
                // 接口控制层
                controller:"controller",
                // 模型层
                model:"model",
                // 数据层
                data:"data",
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
            Lay.logger.debug("开始读取配置文件...");
            // 读取配置文件
            if (config.conf)
            {
                var conf = config.conf;

                if (conf.db)
                {
                    Lay.logger.debug("开始读取数据库配置...");
                    // 处理conf.db
                    if (isString(conf.db))
                    {
                        var _path = getRealPath(conf.db);
                        getJSON(_path, function(_json){
                            if (_json)
                                Lay.Config.Database = _json;
                            Lay.logger.debug("数据库配置:" + _path);
                            done(null);
                        });
                    }
                    else
                    {
                        //直接挂载
                        Lay.Config.Database = conf.db;
                        Lay.logger.debug("数据库配置:直接挂载");
                        done(null);
                    }
                }
                else
                {
                    done(null);
                }
            }
            else
            {
                done(null);
            }
        }).task(function(done){
            Lay.logger.debug("开始读取数据模型...");
            // 载入model
            var mpath = getRealPath(config.path.model);

            function formatClsName(n)
            {
                n = n.toLowerCase();
                return n.replace(/\b(\w)|\s(\w)/g,function(m){return m.toUpperCase()});
            }

            fs.readdir(mpath, function(err, files){
                if (err)
                {
                    Lay.logger.warn("载入Model失败:" + err);
                    done(null);
                }
                else
                {
                    var _dIndex = 0,
                        _fIndex = 0;
                    files.forEach(function(item){
                        _dIndex++;
                        var tmpPath = mpath + '/' + item;
                        if (tmpPath.indexOf("svn") < 0)
                        {
                            fs.stat(tmpPath, function(_err, _stat){
                                if (_stat.isDirectory())
                                {
                                    fs.readdir(tmpPath, function(err1, subfiles){
                                        if (err1)
                                        {
                                            Lay.logger.error("Model载入失败!");
                                            done(null);
                                        }
                                        else
                                        {
                                            _fIndex = 0;
                                            subfiles.forEach(function(subitem){
                                                _fIndex++;
                                                var _mPath = tmpPath + '/' + subitem;
                                                fs.stat(_mPath, function(err1, stats)
                                                {
                                                    if (err1)
                                                        console.logger.error("错误的Model模块:" + _mPath);
                                                    else
                                                    {
                                                        if (!stats.isDirectory())
                                                        {
                                                            Lay.logger.debug("读取数据模型:" + _mPath);
                                                            var _sPath = _mPath.replace(mpath, "").split('/');
                                                            var _parent = _sPath[1],
                                                                _key = _sPath[2].replace(".js", "");
                                                            var _clsName = formatClsName(_parent) + formatClsName(_key);
                                                            modelCache[_clsName] = require(_mPath).model;

                                                            // 全部载入完成
                                                            if (_dIndex == files.length && _fIndex == subfiles.length)
                                                                done(null);
                                                        }
                                                    }
                                                });
                                            });
                                        }
                                    });
                                }
                            });
                        }
                    });
                }
            });

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