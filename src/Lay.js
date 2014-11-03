var object = require("./Lib/Util/Object");
var LayLine = require("./LayLine").Instance;
var dateFormat = require("./Lib/Util/DateFormat").format;
var http = require("http");
var https = require("https");
var fs = require("fs");
var path = require("path");
var Howdo = require("howdo");
var logger = require("tracer");
var journey = require("journey");
(function(){
    var Lay = this.Lay = {
        Config:{},
        logger:logger.colorConsole()
    };

    function isType(type) {
        return function(obj) {
            return {}.toString.call(obj) == "[object " + type + "]";
        };
    }
    var isFunction = isType("Function"),
        isString = isType("String");

    /**
     * 接口请求类型
     * @type {{GET: number, POST: number, BOTH: number, PUT: number, DELETE: number, ALL: number}}
     */
    Lay.CallType = {
        GET:0,
        POST:1,
        BOTH:2,
        PUT:3,
        DELETE:4,
        ALL:5
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

        /**
         * 日志服务
         */
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
                        newLine(config, Lay.CallType.GET, req, res, params);
                    });

                    this.post(config.routerMap).bind(function(req, res, params){
                        newLine(config, Lay.CallType.POST, req, res, params);
                    });

                    this.put(config.routerMap).bind(function(req, res, params){
                        newLine(config, Lay.CallType.PUT, req, res, params);
                    });

                    this.del(config.routerMap).bind(function(req, res, params){
                        newLine(config, Lay.CallType.DELETE, req, res, params);
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

    function newLine(config, calltype, req, res, params)
    {
        if (req.url.pathname.trim() != "")
        {
            var _http = {
                request:req,
                response:res,
                calltype:calltype,
                params:params
            }
            return new LayLine(config, _http, Lay.logger);
        }
        return null;
    }

    /**
     * 获取相对于项目根路径的真实路径
     * @returns {string}
     */
    function getRealPath()
    {
        return path.join(Lay.Config.path.root, path.join.apply(this, arguments));
    };
})();