"use strict";

/**
 * basic Fossil support for the Cloud9 IDE
 *
 * @copyright 2013, Lucio M. Tato - https://github.com/luciotato
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

var util = require("util");

var Plugin = require("../cloud9.core/plugin");
var c9util = require("../cloud9.core/util");

var name = "fossil";
var ProcessManager;
var EventBus;

module.exports = function setup(options, imports, register) {
    ProcessManager = imports["process-manager"];
    EventBus = imports.eventbus;
    imports.ide.register(name, FossilPlugin, register);
};

var FossilPlugin = function(ide, workspace) {
    Plugin.call(this, ide, workspace);

    this.pm = ProcessManager;
    this.eventbus = EventBus;
    this.workspaceId = workspace.workspaceId;
    this.channel = this.workspaceId + "::fossil";

    this.hooks = ["command"];
    this.name = "fossil";

    this.fossilEnv = {
        EDITOR: "",
        FOSSIL_EDITOR: ""
    };

    this.processCount = 0;
};

util.inherits(FossilPlugin, Plugin);

(function() {

    this.init = function() {
        var self = this;
        this.eventbus.on(this.channel, function(msg) {
            if (msg.type == "shell-start")
                self.processCount += 1;

            if (msg.type == "shell-exit")
                self.processCount -= 1;

            self.ide.broadcast(JSON.stringify(msg), self.name);
        });
    };

    this.command = function (user, message, client) {
        var self = this;
        var cmd = message.command ? message.command.toLowerCase() : "";

        if (cmd !== "fossil" && cmd !== "pwd" && cmd !== "bash"  )
            return false;

        if (typeof message.protocol == "undefined")
            message.protocol = "client";

        // everything after -m is commit message 
        if (message.argv[1] == "commit" && message.argv[2] == "-m") {
            message.argv[3] = message.argv.slice(3).join(' ');
            message.argv.splice(4);
        }

        console.log(message.argv);
        
        this.pm.spawn("shell", {
                    command: cmd,
                    args: message.argv.slice(1),
                    cwd: message.cwd,
                    env: this.fossilEnv,
                    extra: message.extra,
                    encoding: "ascii"
                    }
            , this.channel
            , function(err, pid) {
                        if (err)
                            self.error(err, 1, message, client);
                }
        );

        return true;
    };

    var fossilhelp     = null;
    var commandsMap = {
            "default": {
                "commands": {
                    "[PATH]": {"hint": "path pointing to a folder or file. Autocomplete with [TAB]"}
                }
            }
        };

    this.$commandHints = function(commands, message, callback) {
        var self = this;

        if (!fossilhelp) {
            fossilhelp = {};
            this.pm.exec("shell", {
                command: "fossil",
                args: [],
                cwd: message.cwd,
                env: this.fossilEnv
            }, function(code, out, err) {
                if (!out && err)
                    out = err;

                if (!out)
                    return callback();

                fossilhelp = {"fossil": {
                    "hint": "Lean DCVS",
                    "commands": {}
                }};
                out.replace(/[\s]{3,4}([\w]+)[\s]+(.*)\n/gi, function(m, sub, hint) {
                    fossilhelp.fossil.commands[sub] = self.augmentCommand(sub, {"hint": hint});
                });
                onfinish();
            }, null, null);
        }
        else {
            onfinish();
        }

        function onfinish() {
            c9util.extend(commands, fossilhelp);
            callback();
        }
    };

    this.augmentCommand = function(cmd, struct) {
        var map = commandsMap[cmd] || commandsMap["default"];
        return c9util.extend(struct, map || {});
    };

    this.canShutdown = function() {
        return this.processCount === 0;
    };

}).call(FossilPlugin.prototype);
