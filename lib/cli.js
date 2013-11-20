var Class  = require('js-class'),
    elements = require('evo-elements'),
    CliBase = elements.Cli,
    Config  = elements.Config,
    Neuron = require('evo-neuron').Neuron,

    components = require('../components.json');

var LOCAL_CLI = ['services', 'toolbox'];

var AXON_STATES = {
    connecting:   'hi',
    connected:    'ok',
    disconnected: 'lo'
};

var Cli = Class(CliBase, {
    constructor: function () {
        CliBase.prototype.constructor.call(this, require('../package.json').name);
        this.services = components.services;
        this.logdir = '/var/log/cloud';
        this.rundir = '/var/run/cloud';
        this.datdir = '/var/lib/cloud';
        this.cfgdir = '/etc/cloud.d';

        this.options
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
                default: this.datdir,
                help: 'Directory for data files',
                callback: function (val) {
                    this.datdir = val;
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
        ;

        this._loadCliExts('./', LOCAL_CLI);
        this._loadCliExts('evo-', components.cli);
    },

    neuronCmd: function (command, defineFn, performFn) {
        var cmd = this.options.command(command);
        defineFn(cmd);
        return cmd.option('sock-dir', {
            type: 'string',
            help: 'Unix socket directory of neuron'
        })
        .callback(performFn);
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

    neuronConnectService: function (name, cliOpts, callback) {
        var neuron = this.neuronConnect(name, this.neuronOpts(cliOpts));
        var timer = setTimeout(function () {
            this.fatal('Neuron connection timeout: is service "' + name + '" running?');
        }.bind(this), 3000);
        neuron.on('state', function (state) {
                if (state == 'connected') {
                    clearTimeout(timer);
                    callback(neuron);
                }
            });
        return neuron;
    },

    _loadCliExts: function (prefix, exts) {
        exts.forEach(function (name) {
            require(prefix + name).cli(this);
        }, this);
    }
});

module.exports = Cli;
