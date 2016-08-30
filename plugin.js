define(function(require, exports, module) {

    main.consumes = [
        "Plugin", "layout", "menus", "tabinteraction", "settings", "ui",
        "dialog.notification", "ext", "fs.cache", "tree", "util", "tabManager", "ace",
        "navigate", "preferences.themes", "layout.preload", "dialog.notification", "chat"
    ];
    main.provides = ["theme.jett"];
    return main;

    /**
     * Client-side plugin for jett theme
     * @method main
     * @param {} options
     * @param {} imports
     * @param {} register
     * @return
     */
    function main(options, imports, register) {
        var Plugin = imports.Plugin;
        var menus = imports.menus;
        var settings = imports.settings;
        var layout = imports.layout;
        var tabinteraction = imports.tabinteraction;
        var notify = imports["dialog.notification"].show;
        var ui = imports.ui;
        var ext = imports.ext;
        var fsCache = imports["fs.cache"];
        var tree = imports["tree"];
        var util = imports["util"];
        var tabs = imports.tabManager;
        var ace = imports.ace;
        var navigate = imports.navigate;
        var prefs = imports["preferences.themes"];
        var preload = imports["layout.preload"];
        var notify = imports["dialog.notification"].show;
        var chat = imports["chat"];

        /***** Initialization *****/

        var plugin = new Plugin("Ajax.org", main.consumes);
        var emit = plugin.getEmitter();

        // Adjust theme settings accordingly
        var themeEnabled = settings.getBool("user/theme/@jett");
        // If this is the first time they've installed the jett plugin then skin it with jett
        if (themeEnabled == null) {
            settings.set("user/theme/@jett", true);
            themeEnabled = true;
        }
        // Make it appear that we're using flat-light theme, but overlay jett if enabled
        // This is a little hacky b/c some of the layout's methods are private
        // We set the theme as a flat light b/c this theme has all the correct ace table heights
        if (themeEnabled) settings.set("user/general/@skin", 'flat-light');

        var loaded = false;
        var cssDOM;

        // Fix ACE theme setting. After initially choosing the jett theme a reload will prompt
        // the user for flat-light defaults. The following code detects this and stops it.
        var fixSettings = false;
        settings.on("user/ace/@theme", function(e) {
            // If we need to fix the settings and the ACE theme is not already jett then correct it
            if (fixSettings && e != "ace/theme/jett") {
                fixSettings = false;
                setThemeDefaults();
            }
        });
        layout.on("themeChange", function(e) {
            // If Cloud9 has just loaded and there's a theme change detected then set a flat to fix the ACE theme
            if (!loaded && e.theme == "flat-light" && themeEnabled) {
                fixSettings = true;
                // Returning true makes sure a default settings dialog is not displayed.
                return true;
            }
        });

        /**
         * Called when plugin is loaded
         * @method load
         * @return
         */
        function load() {
            if (loaded) return false;

            /**
             * Active tabs with ACE editor get the same color as the current ACE theme
             * @method styleTab
             * @param {} e
             * @return
             */
            var styleTab = function(e) {

                var panes = tabs.getPanes();

                panes.every(function(pane) {

                    // Add a file icon to the tab if jett is enabled
                    if (themeEnabled)
                        pane.getTabs().every(function(tab) {
                            setTabIcon(tab);
                            return true;
                        });

                    // Style tabs with ACE editor foreground and background colors if they're active
                    if (pane.activeTab) {

                        var tab = pane.activeTab;

                        if (themeEnabled && ace.theme && ace.theme.bg && ace.theme.fg) {
                            var colorHash = {
                                "ace": ace.theme.bg,
                                "terminal": '#000',
                                "preferences": '#25272C'
                            }

                            tab.backgroundColor = tab.aml.$button.style.backgroundColor = (colorHash[pane.activeTab.editorType] || "iherit");
                            tab.foregroundColor = tab.aml.$button.style.color = ace.theme.fg;
                        }

                        /**
                         * Clears the tab color if it's based on the ACE editor
                         * @method clearColor
                         * @return
                         */
                        var clearColor = function() {
                            tab.backgroundColor = tab.aml.$button.style.backgroundColor = '';
                            tab.foregroundColor = tab.aml.$button.style.color = '';
                        };

                        pane.activeTab.on("deactivate", clearColor);
                    }

                    return true;

                });

            }

            /**
             * Tabs get file icons!
             * @method setTabIcon
             * @param {} tab
             * @return
             */
            function setTabIcon(tab) {

                if (!tab.path) return;

                var iconHTML = '<span class="filetree-icon ' +
                    getIconClass(tab.path) +
                    '"></span>' +
                    tab.title;
                tab.aml.$button.querySelector(".sessiontab_title").innerHTML = iconHTML;

            }

            // Anytime the user switches tabs or themes make sure we have the correct tab colors
            ace.on("themeChange", styleTab);
            tabs.on("focusSync", styleTab);
            // Set file icon when the tabs are drawn
            tabs.on("tabCreate", function(e) {
                if (themeEnabled && e.tab.title && e.tab.path) {
                    setTabIcon(e.tab);
                }
            });

            /**
             * Mutation observer to look for when chat dialog changes so we can style it
             */
            chat.on("draw", function(e) {

                var observer = new MutationObserver(function(mutations) {
                    // When the mutation happens
                    mutations.forEach(function(mutation) {

                        if (mutation.addedNodes && mutation.addedNodes[0]) {

                            var messageEl = mutation.addedNodes[0];

                            // Append a special class that lets us identify if this chat message is from 
                            // us or someone else.
                            if (messageEl.childNodes[1].innerText == "You")
                                messageEl.classList.add("you");

                            /** The following allows us to apply CSS3 Animations to messages **/

                            setTimeout(function() {
                                messageEl.classList.add("anim-start");
                            }, 50);
                        }

                    });
                });

                // Notify me dom updates in the chat area
                var observerConfig = {
                    attributes: false,
                    childList: true,
                    characterData: false
                };

                var targetNode = e.html.querySelector('.chatText');
                observer.observe(targetNode, observerConfig);

            });

            /**
             * Add file icons to the file search results
             */
            navigate.on("draw", function() {

                var dp = navigate.tree.provider;

                override(dp, 'renderRow', function(original) {
                    return function(row, html, config) {

                        // If jett is not enabled then return
                        if (!themeEnabled) {
                            return original.apply(this, arguments);
                        }

                        var path = dp.visibleItems[row];
                        var isSelected = dp.isSelected(row);
                        var filename = path.substr(path.lastIndexOf("/") + 1);
                        var icon = getIconClass(filename);

                        html.push("<div class='item " + (isSelected ? "selected " : "") + dp.getClassName(row) + "' style='height:" + dp.innerRowHeight + "px'><span class='filetree-icon " + icon + "'>" + dp.replaceStrong(filename) + "</span><small class='path'>" + dp.replaceStrong(path) + "</small></div>");

                    }
                });


            });

            /*
             * Customize file icons on the file tree
             */
            tree.on("draw", function(e) {


                override(fsCache.model, 'getIconHTML', function(original) {
                    return function(node) {

                        // If jett is not enabled then return
                        if (!themeEnabled) {
                            return original.apply(this, arguments);
                        }

                        var icon = node.isFolder ? "folder" : getIconClass(node.label);

                        if (node.status === "loading") icon = "loading";
                        return "<span class='filetree-icon " + icon + "'></span>";
                    }
                });
            });

            /*
             * Add a jett pref option in theme preferences
             */
            prefs.on("draw", function(e) {


                // Get the flat theme element with the named color from themes.js
                //          style="background:#dcdbdb;"
                // This a little fragile since there are no public API methods for adding theme prefs
                //
                var themePrefEl = e.html.querySelector('div.rbcontainer.themepicker[style="background:#dcdbdb;"]');
                var jettPref = themePrefEl.cloneNode(true);
                jettPref.style.background = '#2C323C';

                // Map background colors to theme names based on the passed aml
                var themes = {};
                /**
                 * A little hacky but helps add a prefs option for jett theme
                 * @method findPrefs
                 * @param {} aml
                 * @return
                 */
                var findPrefs = function(aml) {
                    if (aml.childNodes) {
                        aml.childNodes.forEach(function(child) {
                            if (child instanceof apf.radiobutton) {
                                themes[child.style] = child.value;
                            }
                            findPrefs(child);
                        })
                    }
                }
                findPrefs(e.aml);

                // Bind a new click method to the existing prefs
                var rbs = e.html.querySelectorAll('div.rbcontainer.themepicker');
                [].forEach.call(rbs, function(rb) {
                    // Extend every click method for current theme changes
                    override(rb, 'onclick', function(original) {
                        return function(e) {

                            // Special case for flat-light theme
                            // If the user chooses flat-light and we're already masquerading as flat-light theme
                            if ('flat-light' == themes[this.getAttribute('style')] && themeEnabled) {

                                this.classList.add('rbcontainerSelected');

                                preload.getTheme('flat-light', function(err, theme) {
                                    if (err)
                                        return;

                                    // Remove Current Theme
                                    enableJett(false);
                                    // Refresh tree icons
                                    tree.refresh(true, function() {});
                                });
                            }

                            jettPref.classList.remove('rbcontainerSelected');

                            return original.apply(this, arguments);
                        }
                    })

                });

                /**
                 * Helper to reset options for the theme picker
                 * @method resetOptions
                 * @return
                 */
                function resetOptions() {
                    jettPref.classList.add('rbcontainerSelected');

                    [].forEach.call(rbs, function(rb) {
                        rb.classList.remove('rbcontainerSelected');
                    });
                }

                if (themeEnabled) {
                    resetOptions();
                }
                else {
                    jettPref.classList.remove('rbcontainerSelected');
                }

                /**
                 * Method that get's called when a user clicks on the jett theme pref
                 * @method onclick
                 * @return
                 */
                jettPref.onclick = function() {

                    // If jett theme is already set then do nothing
                    if (themeEnabled) return;
                    // Perform the option to change to jett
                    enableJett(true);
                    // Set preference defaults
                    setThemeDefaults();
                    // Reset the options for the theme picker in preferences
                    resetOptions();
                    // Refresh tree to reset icons
                    tree.refresh(true, function() {});
                };

                themePrefEl.parentElement.appendChild(jettPref);

            });

            layout.on("themeChange", function(e) {
                enableJett(false);
                // Refresh file icons
                tree.refresh(true, function() {});
            });

            layout.on("themeDefaults", function(e) {
                if (themeEnabled) {
                    setThemeDefaults();
                    return true;
                }
            });

            // Enable this theme if the user has never seen it or they specifically set it
            if (themeEnabled) {
                enableJett(true);
            }


            loaded = true;

        }

        function setThemeDefaults() {
            // ACE gets the matching jett theme
            settings.set("user/ace/@theme", "ace/theme/jett");
            // Auto Scroll to active files
            settings.set("user/general/@revealfile", true);
            // Set user defaults
            settings.set("user/ace/@cursorStyle", "smooth slim");
            settings.set("user/tabs/@title", true);
            // Good looking fonts!
            settings.set("user/ace/@fontFamily", "'Menlo','Inconsolata', 'Source Code Pro', monospace");
            settings.set("user/ace/@fontSize", 14);
            settings.set("user/ace/@antialiasedfonts", true);
            settings.set("user/terminal/@fontfamily", "'Inconsolata', 'Source Code Pro', monospace");
            settings.set("user/terminal/@fontsize", 14);
            // Give the output console the same look as the our theme
            settings.set("user/output/@backgroundColor", "#2b303b");
            settings.set("user/output/@foregroundColor", "#767B85");
            settings.set("user/output/@selectionColor", "#343d46");
        }

        /**
         * Toggle the jett theme on/off
         * @str an identifiable attribute
         * @method enableJett
         * @param {} enabled If true then jett theme is on
         * @return
         */
        function enableJett(enabled) {

            // Update settings
            themeEnabled = enabled;
            settings.set("user/theme/@jett", enabled);

            // If the jett theme is enabled set some defaults and theme specific prefs
            if (enabled) {
                // Set file tree height correctly so clicks will work
                fsCache.model.rowHeightInner = 25;
                fsCache.model.rowHeight = 25;
            }

            // Look for theme specific CSS DOM objects and enable / disable them accordingly
            // C9 core actually removes / inserts CSS in the DOM but this has been noted to be quicker
            [].forEach.call(document.styleSheets, function(sheet, i, a) {

                var rules = sheet.rules || sheet.cssRules;
                // It's safe to say all embeded themes have over 2000 rules
                if (rules.length > 2000) {
                    sheet.disabled = enabled;
                }
            });

            // Should we enable the jett theme CSS?
            cssDOM.disabled = !enabled;

        }


        /**
         * Helper function to help us extend current cloud9 events
         * @method override
         * @param {} object
         * @param {} methodName
         * @param {} callback
         * @return
         */
        function override(object, methodName, callback) {
            object[methodName] = callback(object[methodName])
        }

        /**
         * Reusable function to get the CSS class of a file type
         * @method getIconClass
         * @param {} filename
         * @return icon
         */
        function getIconClass(filename) {

            if (!filename) return '';

            // Remove the path if it's a directory string
            filename = filename.split("/").pop();
            // Get the file.extention
            var icon = filename.split(".").pop().toLowerCase();

            filename = filename.toLowerCase();
            if (filename == "package.json") icon = "npm";
            if (filename == "composer.json") icon = "composer";
            if (filename == "bower.json") icon = "bower";
            if (filename == "gulpfile.js") icon = "gulp";
            if (filename == "gruntfile.js") icon = "grunt";

            return icon;

        }

        var drawn = false;

        /**
         *
         * @method draw
         * @return
         */
        function draw() {
            if (drawn) return;
            drawn = true;

            emit("draw");
        }

        /***** Methods *****/


        /***** Lifecycle *****/

        plugin.on("load", function() {
            load();
        });
        plugin.on("enable", function() {

        });
        plugin.on("disable", function() {

        });
        plugin.on("unload", function() {
            loaded = false;
            drawn = false;

        });

        /***** Register and define API *****/

        /**
         *
         **/
        plugin.freezePublicAPI({

        });

        // Keep page from rendering until theme css loads
        // This static route is registered in the build_theme.js
        require(["text!/static/plugins/c9.ide.theme.jett/css/compile_jett.css"], function(css) {

            // Once we've loaded the jett CSS then insert it directly into the DOM
            cssDOM = document.createElement("style");
            cssDOM.appendChild(document.createTextNode(css));
            cssDOM.title = "compile_jett";
            document.getElementsByTagName("head")[0].appendChild(cssDOM);
            // Disable this style by default
            cssDOM.disabled = true;

            register(null, {
                "theme.jett": plugin
            });
        });

    }
});
