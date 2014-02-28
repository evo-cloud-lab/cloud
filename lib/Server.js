var Class = require('js-class'),
    fs    = require('fs'),
    path  = require('path'),
    async = require('async'),
    _     = require('underscore'),
    mkdir = require('mkdirp'),
    forever  = require('forever-monitor'),
    elements = require('evo-elements'),
    Logger = elements.Logger,
    Errors = elements.Errors;

var SERVICES = [
    function configConnector(config, opts) {
        config.connector = {
            single: true
        };
        return {
            name: 'connector'
        }
    },

    function configCubes(config, opts) {
        config.cubes = {
            engines: {
                entity: {
                    name: 'tingodb',
                    file: path.join(opts.datadir, 'cubes', 'entity.db')
                },
                blob: {
                    name: 'filesystem',
                    path: path.join(opts.datadir, 'cubes', 'blob')
                }
            },
            cachedir: path.join(opts.datadir, 'cubes', 'cache')
        };
        return {
            name: 'cubes',
            dirs: [
                config.cubes.engines.blob.path,
                config.cubes.cachedir
            ]
        };
    },

    function configAmbience(config, opts) {
        return { name: 'ambience' };
    },

    function configGovernor(config, opts) {
        return { name: 'governor' };
    },

    function configLauncher(config, opts) {
        return { name: 'launcher' };
    }
];

var ServiceMonitor = Class(process.EventEmitter, {
    constructor: function (name, child, server) {
        this._name = name;
        this._server = server;
        (this._child = child)
            .on('error', this.onError.bind(this))
            .on('exit:code', this.onExitCode.bind(this))
            .on('exit', this.onExit.bind(this))
            .on('start', this.onStart.bind(this))
            .on('stop', this.onStop.bind(this))
            .on('restart', this.onStart.bind(this))
        ;
    },

    get name () {
        return this._name;
    },

    get running () {
        return this._child.running;
    },

    get stopped () {
        return this._stopped;
    },

    stop: function () {
        this._stopping = true;
        if (this._child.running) {
            this._child.stop();
        }
    },

    onError: function (err) {
        this._emitState('ERROR');
        this.emit('error', err, this);
    },

    onExitCode: function (code, signal) {
        if (this._stopping) {
            this.onStop();
        } else {
            this._emitState('DOWN');
        }
        this._lastExit = { code: code, signal: signal };
        this.emit('off', this);
    },

    onExit: function () {
        this._stopped = true;
        if (this._stopping) {
            this.emit('exit', this._lastExit, this);
        } else {
            var err;
            if (this._lastExit) {
                err = this._lastExit.signal ? Errors.killed(this._lastExit.signal) : Errors.exited(this._lastExit.code);
            } else {
                err = Errors.exited();
            }
            this.emit('error', err, this);
        }
    },

    onStart: function () {
        this._emitState('ON');
        this.emit('on', this);
    },

    onStop: function () {
        this._emitState('OFF');
    },

    _emitState: function (state) {
        if (state != this._state) {
            this._state = state;
            this._server.emit('service-state', this.name, state);
        }
    }
});

var Server = Class(process.EventEmitter, {
    constructor: function (env) {
        this.env = env;
    },

    start: function () {
        async.series([
            this._startServices.bind(this),
            this._startApi.bind(this)
        ], function (err) {
            err ? this.emit('error', err) : this.emit('start');
        }.bind(this));
        return this;
    },

    stop: function () {
        if (!this.stopping) {
            this.stopping = true;
            async.each(this.services, function (monitor, next) {
                if (monitor.stopped) {
                    next();
                } else {
                    this.emit('stop-service', monitor.name);
                    monitor.on('exit', function () { next(); }).stop();
                }
            }.bind(this), function (err) {
                this.emit('stop', err);
            }.bind(this));
        }
        return this;
    },

    _startServices: function (done) {
        var config = {
            neuron: {
                dendrite: {
                    sock: path.join(this.env.rundir, 'neuron-${name}.sock')
                }
            },
            logger: {
                level: this.env.loglevel || undefined,
                drivers: {
                    file: {
                        driver: 'file',
                        options: { }        // filename will be filled in later
                    }
                }
            }
        };

        var svcs = SERVICES.map(function (configFn) {
            return configFn(config, this.env);
        }.bind(this));

        var self = this;
        async.series([
            function (next) {
                async.each(['rundir', 'datadir', 'logdir'], function (key, next) {
                    mkdir(self.env[key], next);
                }, next);
            },
            function (next) {
                async.each(svcs, function (svc, next) {
                    svc.dirs ? async.each(svc.dirs, mkdir, next) : next();
                }, next);
            },
            function (next) {
                self.services = svcs.map(function (svc) {
                    var opts = _.extend({
                        silent: true,
                        max: 5,
                        minUptime: 1000,
                        spinSleepTime: 1000,
                        cwd: self.env.rundir,
                        outFile: path.join(self.env.logdir, svc.name + '.stdout.log'),
                        errFile: path.join(self.env.logdir, svc.name + '.stderr.log'),
                        killSignal: 'SIGTERM'
                    }, svc.options || {});

                    var cmd = [
                        path.resolve(__dirname, path.join('../node_modules/.bin', svc.command || 'evo-' + svc.name)),
                        '-D', '.=' + JSON.stringify(config)
                    ];
                    if (svc.config) {
                        cmd.push('-D');
                        cmd.push('.+=' + JSON.stringify(svc.config));
                    }
                    cmd.push('--logger-drivers-file-options-filename=' + path.join(self.env.logdir, svc.name + '.log'));
                    svc.args && (cmd = cmd.concat(svc.args));

                    self.emit('start-service', svc.name);

                    var monitor = new ServiceMonitor(svc.name, forever.start(cmd, opts), self);
                    monitor.on('error', self.onServiceError.bind(self));
                    return monitor;
                });
                next();
            }
        ], done);
    },

    _startApi: function (done) {
        this.emit('start-api');
        // TODO
        done();
    },

    onServiceError: function (err, service) {
        err.message = 'ServiceError ' + service.name + ': ' + err.message;
        err.service = service.name;
        this.emit('error', err);
    }
});

module.exports = Server;
