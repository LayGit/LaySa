var mysql = require("mysql");

var poolCluster = mysql.createPoolCluster();
var _ids = {};

var MySql = function(id, config){
    if (!_ids[id])
    {
        poolCluster.add(id, config);
        _ids[id] = true;
    }
    this.id = id;
    this.logger = config.logger;
};

MySql.prototype = {
    log:function(msg, level){
        if (this.logger && this.logger[level])
            this.logger[level](msg);
        else
            console.log(msg);
    },
    transaction:function(func){
        var that = this;
        poolCluster.getConnection(that.id, function(err, conn){
            conn.beginTransaction(function(e){
                func.apply(this, [conn, e]);
            });
        });
    },
    query:function(queryString, callback){
        var that = this;
        poolCluster.getConnection(that.id, function(err1, conn){
            if (err1)
                that.log(err1, 'error');
            conn.query(queryString, function(err2, rows, fields){
                conn.release();
                if (err2)
                    that.log(err2, 'error');
                if (callback)
                    callback.apply(this, arguments);
            });
        });
        return this;
    },
    call:function(config){
        //调用存储过程
        /**
         * config.proc
         * config.params
         */
    },
    find:function(config){
        config = config || {};

        // 从select开始
        var queryString = "select ";

        // field
        config.fields = config.fields || "*";
        queryString += config.fields;

        // table
        queryString += " from " + config.table;

        //where
        queryString += objToEqualString(config.where, " where ", " and ");

        // order by
        queryString += objToEqualString(config.orderBy, " order by ", ",");

        // limit
        if (config.limit)
            queryString += " limit " + config.limit + "";

        return this.query(queryString, config.complete);
    },
    update:function(config){

        config = config || {};
        var queryString = "update " + config.table;

        // set
        queryString += objToEqualString(config.set, " set ", ",");

        //where
        queryString += objToEqualString(config.where, " where ", " and ");

        // order by
        queryString += objToEqualString(config.orderBy, " order by ", ",");

        //limit
        if (config.limit)
            queryString += " limit " + config.limit;

        if (config.trans)
        {

        }

        return this.query(queryString, config.complete);
    },
    add:function(config){
        /**
         * config.table
         * config.data 单条，多条
         */
        config = config || {};
        var queryString = "insert into " + config.table;

        // data优先级高
        if (config.data)
        {
            // 多条
            if (isArray(config.data))
            {
                var _data = config.data;

                //建立列顺序路由
                var _route = {};

                // 数据数组
                var _toInsert = [];

                // 遍历数据
                for (var i in _data)
                {
                    var _tempData = _data[i];

                    //建立单条数据
                    var _tempToInsert = [];

                    // 记录列遍历
                    var _index = 0;
                    for (var col in _tempData)
                    {
                        if (_toInsert.length == 0)
                        {
                            _route = {};
                            // 建立顺序路由关系
                            _route[col] = _index;
                        }

                        // 填充数据
                        _tempToInsert[_route[col]] = _tempData[col];

                        _index++;
                    }

                    // 放入待插入数组
                    _toInsert.push(_tempToInsert);
                }

                // 遍历完毕 转格式
                var _columns = "",
                    _values = "";
                for (var col in _route)
                {
                    _columns += _columns == "" ? "(" : ",";
                    _columns += _route[col];
                }
                _columns += ")values";

                // 处理数据
                for (var i = 0, iLen = _toInsert.length; i < iLen; i++)
                {
                    _values += arrayToString(_toInsert[i], true);
                    if (i != iLen - 1)
                        _values += ",";
                }

                // 拼合
                queryString += " " + _columns + _values;

                return this.query(queryString);
            }
            else
            {
                // 单条
                var _columns = "",
                    _values = "";
                for (var col in config.data)
                {
                    _columns += _columns == "" ? "(" : ",";
                    _columns += col;
                    _values += _values == "" ? ")values(" : ",";
                    _values += "'" + config.data[col] + "'";
                }
                queryString += _columns + _values + ")";

                return this.query(queryString, config.complete);
            }
        }
        else if (config.values)
        {
            if (config.columns && config.columns.length > 0)
                queryString += arrayToString(config.columns) + "values";

            var _values = config.values;
            for (var i = 0, iLen = _values.length; i < iLen; i++)
            {
                queryString += arrayToString(_values[i]);

                if (i != iLen - 1)
                    queryString += ",";
            }

            return this.query(queryString, config.complete);
        }
        return this;
    },
    del:function(config){
        config = config || {};
        var queryString = "delete from " + config.table;

        //where
        queryString += objToEqualString(config.where, " where ", " and ");

        // order by
        queryString += objToEqualString(config.orderBy, " order by ", ",");

        if (config.limit)
            queryString += " limit " + config.limit;

        return this.query(queryString, config.complete);
    },
    addOrUpdate:function(config){
        config = config || {};
    },
    count:function(config){
        config = config || {};
        config.fields = config.fields || "*";
        config.as = config.as || "count";
        var queryString = "select count";
        queryString += "(" + config.fields + ") as " + config.as;
        queryString += " from " + config.table;
        queryString += objToEqualString(config.where, " where ", " and ");

        return this.query(queryString, config.complete);
    }
};

function objToEqualString(obj, pf, sp)
{
    var equalStr = "",
        pf = pf || "",
        sp = sp || ",";

    if (obj)
    {
        if (isString(obj))
            equalStr = pf + obj;
        else
        {
            for (var key in obj)
            {
                if (equalStr != "")
                    equalStr += sp;
                equalStr += key + "='" + obj[key] + "'";
            }
            equalStr = pf + equalStr;
        }
    }
    return equalStr;
}

function arrayToString(arr, quotes)
{
    var _retVal = "";
    for (var i = 0,len = arr.length; i < len; i++)
    {
        _retVal += _retVal == "" ? "(" : ",";
        if (quotes)
            _retVal += "'" + arr[i] + "'";
        else
            _retVal += arr[i];
    }
    return _retVal + ")";
}

function isType(type) {
    return function(obj) {
        return {}.toString.call(obj) == "[object " + type + "]";
    };
}

var isString = isType("String"),
    isArray = isType("Array"),
    isObject = isType("Object");

exports.Instance = MySql;