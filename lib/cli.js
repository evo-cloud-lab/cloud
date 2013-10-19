var Class  = require('js-class'),
    tty    = require('tty'),
    util   = require('util'),
    nomnom = require('nomnom'),
    colors = require('colors'),
    Config = require('evo-elements').Config,
    Neuron = require('evo-neuron').Neuron,

    components = require('../components.json');

var LOCAL_CLI = ['services', 'toolbox'];

var THEME = {
    warn: function (str) { return str.yellow; },
    err:  function (str) { return str.red; },
    verb: function (str) { return str.yellow; },
    ok:   function (str) { return str.green; },
    hi:   function (str) { return str.white; },
    lo:   function (str) { return str.grey; },
    live: function (str) { return str.cyan; },
    hot:  function (str) { return str.red; },
    cold: function (str) { return str.blue; },
    em:   function (str) { return str.bold; },
    inv:  function (str) { return str.inverse; },
    _:    function (str) { return str.underline; }
};

var AXON_STATES = {
    connecting:   'hi',
    connected:    'ok',
    disconnected: 'lo'
};

var Cli = Class({
    constructor: function () {
        this.options = nomnom;
        this.services = components.services;
        this.debugging = false;
        this.logdir = '/var/log/cloud';
        this.rundir = '/var/run/cloud';
        this.datdir = '/var/lib/cloud';
        this.cfgdir = '/etc/cloud.d';

        this.options
            .script(require('../package.json').name)
            .options({
                debug: {
                    flag: true,
                    default: false,
                    help: 'Print more information for debugging',
                    callback: function (val) {
                        this.debugging = val;
                    }.bind(this)
                },
                logdir: {
                    type: 'string',
                    default: this.logdir,
                    help: 'Directory for log files',
                    callback: function (val) {
                        this.logdir = val;
                    }.bind(this)
                },
                loglevel: {
                    type: 'string',
                    default: 'notice',
                    help: 'Set log level with --logdir specified',
                    callback: function (val) {
                        this.loglevel = val;
                    }.bind(this)
                },
                rundir: {
                    type: 'string',
                    default: this.rundir,
                    help: 'Directory for runtime files',
                    callback: function (val) {
                        this.rundir = val;
                    }.bind(this)
                },
                datadir: {
                    type: 'string',
                    default: this.datdir,
                    help: 'Directory for data files',
                    callback: function (val) {
                        this.datdir = val;
                    }.bind(this)
                },
                confdir: {
                    type: 'string',
                    default: this.cfgdir,
                    help: 'Directory for configuration files',
                    callback: function (val) {
                        this.cfgdir = val;
                    }.bind(this)
                },
                color: {
                    flag: true,
                    default: true,
                    help: 'Display in color',
                    callback: function (val) {
                        if (!val) {
                            for (var method in THEME) {
                                this[method] = function (str) { return str; };
                            }
                        }
                    }.bind(this)
                }
            });

        if (tty.isatty(process.stdout)) {
            for (var method in THEME) {
                this[method] = THEME[method];
            }
        } else {
            for (var method in THEME) {
                this[method] = function (str) { return str; };
            }
        }

        this._loadCliExts('./', LOCAL_CLI);
        this._loadCliExts('evo-', components.cli);
    },

    run: function () {
        try {
            nomnom.parse();
        } catch (err) {
            this.fatal(err);
        }
    },

    pad: function (str, width, align) {
        if (str.length > width) {
            return str.substr(0, width - 3) + '...';
        }
        var rest = width - str.length, padl = 0, padr = 0;
        switch (align) {
            case 'center':
                padl = rest / 2;
                padr = rest - padl;
                break;
            case 'right':
                padl = rest;
                break;
            default:
                padr = rest;
                break;
        }
        var spaces = [padl, padr].map(function (sz) {
            var sp = '';
            for (var i = 0; i < sz; i ++) {
                sp += ' ';
            }
            return sp;
        })
        return spaces[0] + str + spaces[1];
    },

    fatal: function (err) {
        this.logErr(this.err('FATAL: ' + (err instanceof Error ? err.message : err.toString())));
        this.debugging && err instanceof Error && this.logErr(err.stack);
        process.exit(1);
    },

    log: function () {
        process.stdout.write(util.format.apply(util, arguments) + "\n");
        return this;
    },

    logErr: function () {
        process.stderr.write(util.format.apply(util, arguments) + "\n");
        return this;
    },

    logObject: function (object, opts, level) {
        var indent = opts && opts.indent || 4;
        level || (level = 0);
        var paddings = this.pad('', indent * level);

        var array = Array.isArray(object);
        if (array || (object != null && typeof(object) == 'object')) {
            for (var k in object) {
                var val = object[k];
                var key = array ? this.hi('-') : (this.hi(opts && opts.keyWidth ? this.pad(k, opts.keyWidth) : k) + ':');
                if (val == null || typeof(val) != 'object') {
                    this.log(paddings + key + ' ' +
                             (opts && opts.renders && opts.renders[k] ? opts.renders[k](val) : this.renderValue(val)));
                } else {
                    this.log(paddings + key);
                    this.logObject(val, opts, level + 1);
                }
            }
        } else {
            this.log(paddings + this.renderValue);
        }
    },

    renderValue: function (val) {
        if (val === undefined) {
            return this.lo('undefined');
        } else if (val === null) {
            return this.lo('null');
        } else {
            switch (typeof(val)) {
                case 'string':
                    return val;
                case 'boolean':
                    return this.verb(val.toString());
                case 'number':
                    return this.live(val.toString());
            }
        }
        return '';
    },

    neuronOpts: function (opts) {
        var options = {};
        if (opts['sock-dir']) {
            options.config = new Config();
            options.config.parse(['--neuron-dendrite-sock=' + path.resolve(opts['sock-dir']) + '/neuron-${name}.sock']);
        };
        return options;
    },

    neuronConnect: function (name, opts) {
        var neuron = new Neuron(opts);
        neuron
            .on('state', function (state) {
                var color = AXON_STATES[state];
                state = state.toUpperCase();
                color && (state = this[color](state));
                this.log(this.verb('Axon') + ' ' + this.hi(name) + ': ' + state);
            }.bind(this))
            .on('error', function (err, info) {
                this.fatal(err);
            }.bind(this))
            .start()
            .connect(name);
        return neuron;
    },

    _loadCliExts: function (prefix, exts) {
        exts.forEach(function (name) {
            require(prefix + name).cli(this);
        }, this);
    }
});

module.exports = Cli;