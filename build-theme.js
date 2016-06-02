"use strict";

main.consumes = ["Plugin", "connect.static"];
main.provides = [];
module.exports = main;

/**
 * Server-side plugin for Jett theme. Mounts url routes and builds theme CSS.
 * @method main
 * @param {} options
 * @param {} imports
 * @param {} register
 * @return
 */
function main(options, imports, register) {
    var Plugin = imports.Plugin;

    var connectStatic = imports["connect.static"];

    var os = require("os");
    var fs = require("fs");
    var path = require("path");
    var error = require("http-error");
    var atomic = require("c9/atomic");

    var themeName = "jett";
    var themeCSSPath = __dirname + '/build/compile_' + themeName + '.css';

    options.version = 'standalone';
    options.cache = path.normalize(path.join(options.pathRoot + '/../build'));
    options.baseUrl = '';
    options.virtual = undefined;
    options.config = 'standalone';


    /**
     * Wraps architect build
     * @method build
     * @return
     */
    var build = function() {
        // delay loading of architect build for faster startup
        // todo should we disable this plugin on local instead?
        build = require(options.pathRoot + "/../node_modules/architect-build/build");
        build.apply(null, arguments);
    };
    var cache;

    /***** Initialization *****/


    var compress = options.compress || true;
    var obfuscate = options.obfuscate || false;
    var keepLess = options.keepLess || false;
    var config = options.config || "ide";
    var settings = options.settings || "standalone";
    var cacheDir = path.resolve(options.cache || os.tmpdir() + "/cdn");
    var staticsConfig;


    /**
     * *** Register and define API ****
     * @method init
     * @return
     */
    function init() {

        /* Add our static content */
        connectStatic.addStatics([{
            path: __dirname + "/fonts",
            mount: "/fonts"
        }, {
            path: __dirname + "/build",
            mount: "/standalone/skin"
        }]);

        getPathConfig('standalone', function(err, pathConfig) {

            if (err) {
                console.error(err, err.stack);
                process.exit(1);
            }

            /* If our custom ACE themes aren't installed then install them */
            var themePath = path.join(pathConfig.root, "plugins/c9.ide.ace/themes.json");

            fs.readFile(themePath, "utf8", function(err, content) {

                if (err) {
                    console.error(err, err.stack);
                    process.exit(1);
                }

                var themes = JSON.parse(content);
                var save = false;

                [themeName].every(function(name) {

                    var themeName = capitalizeFirstLetter(name);
                    if (!themes.hasOwnProperty(themeName)) {
                        themes[themeName] = "ace/theme/" + name;

                        // Copy our theme to the directory
                        ["js", "css"].every(function(ext) {
                            fs.createReadStream(__dirname + '/ace.themes/' + name + '.' + ext)
                                .pipe(fs.createWriteStream(process.cwd() + "/node_modules/ace/lib/ace/theme/" + name + "." + ext));
                            return true;
                        });


                        save = true;
                    }
                    return true;

                });

                // If we had to insert our own config then save the new config
                if (save) {

                    atomic.writeFile(themePath, JSON.stringify(themes, null, 4), "utf8", function(err) {
                        if (err)
                            return console.error("Updating themes ", themePath, "failed", err);

                        var mtime = Math.floor(Date.now() / 1000) * 1000;

                        // set utime to have consistent etag
                        fs.utimes(themePath, mtime / 1000, mtime / 1000, function(e) {
                            if (e) console.error(e);
                        });
                    });
                }
            });

            if (!fileExists(themeCSSPath))
                buildSkin('default', 'compile_' + themeName, pathConfig, function(err, result) {
                    if (err) console.log(err);
                    //callback(err, result && result.code || "");

                    var mtime = Math.floor(Date.now() / 1000) * 1000;

                    atomic.writeFile(themeCSSPath, result.code, "utf8", function(err) {
                        if (err)
                            return console.error("Caching file", themeCSSPath, "failed", err);

                        console.log("File cached at", themeCSSPath);
                        // set utime to have consistent etag
                        fs.utimes(themeCSSPath, mtime / 1000, mtime / 1000, function(e) {
                            if (e) console.error(e);
                        });
                    });
                });
        });



    }

    /**
     * Helper
     * @method capitalizeFirstLetter
     * @param {} string
     * @return BinaryExpression
     */
    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /**
     * Helper
     * @method fileExists
     * @param {} filePath
     * @return
     */
    function fileExists(filePath) {
        try {
            return fs.statSync(filePath).isFile();
        }
        catch (err) {
            return false;
        }
    }


    /**
     * Modified function present in C9's build.js
     * @method readConfig
     * @param {} config
     * @return ObjectExpression
     */
    function readConfig(config) {
        if (config == "full") {
            var plugins = [];
            ["default-local", "ssh", "default"].forEach(function(n) {
                plugins.push.apply(plugins, readConfig(n).config);
            });
            return {
                config: plugins
            };
        }

        if (config[0] != "/")
            config = path.join(options.pathRoot, "client-" + config);

        if (config.slice(-3) !== ".js")
            config += ".js";

        var settings;
        try {
            settings = require(options.pathRoot + "/../settings/standalone");
            config = require(config);
        }
        catch (e) {
            if (e.code == "MODULE_NOT_FOUND")
                e = new error.NotFound();
            return {
                error: e
            };
        }
        settings = settings();
        settings.packaging = true;
        return {
            config: config(settings)
        };
    }

    /**
     * Modified function present in C9's build.js
     * @method buildSkin
     * @param {} config
     * @param {} color
     * @param {} pathConfig
     * @param {} callback
     * @return
     */
    function buildSkin(config, color, pathConfig, callback) {
        var data = readConfig(config);
        if (data.error)
            return callback(data.error);

        var plugins = data.config.concat([
            "lib/architect/architect"
        ]);
        var lessLibs = [];

        fs.readFile(path.join(pathConfig.root, "plugins/c9.ide.layout.classic/less/lesshat.less"), "utf8", function(err, lesshat) {
            if (err) return callback(err);

            lessLibs.push(lesshat);

            // 372 kb avgerage
            fs.readFile(path.join(__dirname, "less/variables.less"), "utf8", function(err, theme) {
                if (err) return callback(err);

                lessLibs.push(theme);

                lessLibs.staticPrefix = "plugins/c9.ide.theme." + themeName;

                var themeCss = [{
                    id: "text!" + path.join(__dirname, "less/overrides.less"),
                    parent: {}
                }];

                build(plugins, {
                    cache: cache,
                    pathConfig: pathConfig,
                    enableBrowser: true,
                    includeConfig: false,
                    noArchitect: true,
                    compress: compress,
                    filter: [],
                    ignore: [],
                    withRequire: false,
                    compileLess: true,
                    lessLibs: lessLibs,
                    lessLibCacheKey: color,
                    basepath: pathConfig.root,
                    additional: themeCss
                }, callback);
            });
        });
    }


    /**
     * Modified function present in C9's build.js
     * @method getStaticsConfig
     * @param {} callback
     * @return
     */
    function getStaticsConfig(callback) {
        if (staticsConfig)
            return callback(null, staticsConfig);

        tryGetConfig(null, connectStatic);

        if (staticsConfig)
            return callback(null, staticsConfig);

        var dir = path.join(cacheDir, options.version);
        console.log("Linking static files to ", dir, settings);
        require("../../scripts/makestatic.js")(config, settings, {
            dest: dir + "/static",
            symlink: false,
            compress: options.compress,
            getMounts: !options.link,
            saveRjsConfig: false,
        }, function(err, connectStatic) {
            tryGetConfig(err, connectStatic);
            return callback(err, staticsConfig);
        });

        /**
         * Modified function present in C9's build.js
         * @method tryGetConfig
         * @param {} err
         * @param {} connectStatic
         * @return
         */
        function tryGetConfig(err, connectStatic) {

            if (err) {
                console.error(err, err.stack);
                process.exit(1);
            }

            if (!connectStatic || options.link)
                return;

            var mounts = connectStatic.getMounts();
            var rjsConfig = connectStatic.getRequireJsConfig();

            if (!mounts || !mounts[0] || !mounts[0].mount)
                return;

            var pathMap = Object.create(null);
            mounts.forEach(function(mount) {
                pathMap[mount.mount] = mount.path;
            });

            staticsConfig = {
                pathMap: pathMap,
                rjsConfig: JSON.parse(JSON.stringify(rjsConfig))
            };
        }
    }

    /**
     * Modified function present in C9's build.js
     * @method getPathConfig
     * @param {} hash
     * @param {} callback
     * @return
     */
    function getPathConfig(hash, callback) {


        if (!options.link) {
            getStaticsConfig(function(err, config) {
                if (err) return callback(err);

                var pathMap = config.pathMap;
                var pathConfig = config.rjsConfig;

                pathConfig.hash = hash;
                pathConfig.root = path.normalize(path.join(options.pathRoot + '/../'));
                var baseUrl = pathConfig.baseUrl || "";
                for (var p in pathConfig.paths) {
                    var url = pathConfig.paths[p];
                    if (typeof url === "string" && url.substring(0, baseUrl.length) == baseUrl)
                        pathConfig.paths[p] = url.substring(baseUrl.length);
                }
                pathConfig.pathMap = pathMap;
                callback(null, pathConfig);
            });
        }
        else {
            var root = path.resolve(path.join(cacheDir, hash));
            var rjsConfigPath = path.join(root, "/static/requirejs-config.json");
            fs.readFile(rjsConfigPath, "utf8", function(err, pathConfig) {
                if (err) {
                    if (err.code == "ENOENT")
                        return callback(new error.NotFound());
                    else
                        return callback(err);
                }

                try {
                    pathConfig = JSON.parse(pathConfig);
                }
                catch (e) {
                    return callback(e);
                }

                pathConfig.root = path.join(root, pathConfig.baseUrl);
                for (var p in pathConfig.paths) {
                    pathConfig.paths[p] = path.join(root, pathConfig.paths[p]);
                }
                callback(null, pathConfig);
            });
        }
    }



    init();
    register(null, {});
};