#!/usr/bin/env node

var Class = require('js-class'),
    path  = require('path'),
    Cli   = require('evo-elements').Cli,
    Server = require('./lib/Server');

var STATE_STYLUS = {
    'ON':   'ok',
    'DOWN': 'err',
    'OFF':  'lo',
    'ERROR':'err'
};

var ServerApp = Class(Cli, {
    constructor: function () {
        Cli.prototype.constructor.call(this, 'evo-cloud-server');

        this.logdir = '/var/log/evo-cloud';
        this.rundir = '/var/run/evo-cloud';
        this.datadir = '/var/lib/evo-cloud';
        this.cfgdir = '/etc/evo-cloud';
        this.prefix = '';

        this.port = 3080 || process.env.PORT;

        this.options
            .option('prefix', {
                type: 'string',
                default: this.prefix,
                help: 'Prefix for all paths',
                callback: function (val) {
                    this.prefix = val;
                }.bind(this)
            })
            .option('logdir', {
                type: 'string',
                default: this.logdir,
                help: 'Directory for log files',
                callback: function (val) {
                    this.logdir = val;
                }.bind(this)
            })
            .option('loglevel', {
                type: 'string',
                default: 'notice',
                help: 'Set log level with --logdir specified',
                callback: function (val) {
                    this.loglevel = val;
                }.bind(this)
            })
            .option('rundir', {
                type: 'string',
                default: this.rundir,
                help: 'Directory for runtime files',
                callback: function (val) {
                    this.rundir = val;
                }.bind(this)
            })
            .option('datadir', {
                type: 'string',
                default: this.datadir,
                help: 'Directory for data files',
                callback: function (val) {
                    this.datadir = val;
                }.bind(this)
            })
            .option('confdir', {
                type: 'string',
                default: this.cfgdir,
                help: 'Directory for configuration files',
                callback: function (val) {
                    this.cfgdir = val;
                }.bind(this)
            })
            .option('port', {
                default: this.port,
                help: 'Listening port for API endpoint',
                callback: function (val) {
                    var port = parseInt(val);
                    if (port != val || port <= 0 && port > 65535) {
                        return 'Invalid port ' + val;
                    }
                    this.port = port;
                    return undefined;
                }
            })
            .option('host', {
                type: 'string',
                help: 'Listening on specified address',
                callback: function (val) {
                    this.host = val;
                }
            })
        ;
    },

    run: function () {
        Cli.prototype.run.apply(this, arguments);
        var env = {
            rundir: this.prefix + path.resolve(this.rundir),
            datadir: this.prefix + path.resolve(this.datadir),
            logdir: this.prefix + path.resolve(this.logdir),
            loglevel: this.loglevel,
            port: this.port,
            host: this.host
        };
        this._errors = [];
        (this._server = new Server(env))
            .on('error', this._serverError.bind(this))
            .on('start', this._serverStart.bind(this))
            .on('stop',  this._serverStop.bind(this))
            .on('start-service', this._startService.bind(this))
            .on('stop-service',  this._stopService.bind(this))
            .on('service-state', this._serviceState.bind(this))
            .on('start-api',     this._startApi.bind(this))
            .start();
        process.once('SIGINT', this._initiateExit.bind(this));
        process.once('SIGTERM', this._initiateExit.bind(this));
    },

    _initiateExit: function () {
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        this.logOut('');
        this.logAction('EXITING');
        this._server.stop();
    },

    _serverError: function (err) {
        this._errors.push(err);
        this._server.stop();
    },

    _serverStart: function () {
        this.logAction('STARTED', null, null, { verb: this.ok });
    },

    _serverStop: function (err) {
        if (err) {
            this.fatal(err);
        } else if (this._errors.length > 0) {
            this.fatal(this._errors);
        } else {
            this.logAction('QUIT');
            process.exit(0);
        }
    },

    _startService: function (name) {
        this.logAction('START-SERVICE', name);
    },

    _stopService: function (name) {
        this.logAction('STOP-SERVICE', name);
    },

    _serviceState: function (name, state) {
        this.logAction('SERVICE', name, state, {
            verb: this.live,
            state: this[STATE_STYLUS[state]],
            p: { w: 12 }
        });
    },

    _startApi: function () {
        this.logAction('START-API');
    }
});

new ServerApp().run();
