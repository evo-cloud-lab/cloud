var repl   = require('repl'),
    Config = require('evo-elements').Config;

var cli;

function parseData(dataStr) {
    if (dataStr.length > 0) {
        var cfg = new Config();
        cfg.parse(['--data=' + dataStr]);
        return cfg.opts.data;
    }
    return {};
}

function execute(neuron, name, msg, request, next) {
    if (request) {
        cli.logAction('Request');
        cli.logObject(msg);
        neuron.request(name, msg, function (err, resp) {
            err && cli.fatal(err);
            cli.logAction('Response');
            cli.logObject(resp);
            next();
        });
    } else {
        cli.logAction('Send');
        cli.logObject(msg);
        neuron.send(name, msg);
        next();
    }
}

var MESSAGE_STYLUS = {
    verb: function (verb) { return cli.live(verb); },
    state: function (state) { return cli.lo(state); }
};

function messagePump(neuron) {
    process.nextTick(function () {
        neuron.on('message', function (msg) {
            cli.logAction('Message', null, (new Date()).toISOString(), MESSAGE_STYLUS);
            cli.logObject(msg);
        });
    });
}

function startREPL(neuron, name) {
    setTimeout(function () {
        repl.start({
            prompt: name + '> ',
            ignoreUndefined: true,
            eval: function (cmd, context, filename, callback) {
                cmd = cmd.substr(1, cmd.length - 2).trim();
                var pos = cmd.indexOf(' '), msg = {}, request;
                if (pos > 0) {
                    msg.event = cmd.substr(0, pos);
                    var dataStr = cmd.substr(pos + 1).trim();
                    pos = dataStr.indexOf(' ');
                    var opt = pos > 0 ? dataStr.substr(0, pos) : dataStr;
                    if (opt == '-r' || opt == '--request') {
                        request = true;
                        dataStr = pos > 0 ? dataStr.substr(pos + 1).trim() : '';
                    }
                    msg.data = parseData(dataStr);
                } else {
                    msg.event = cmd.trim();
                    msg.data = {};
                }
                if (msg.event.length > 0) {
                    execute(neuron, name, msg, request, function () {
                        callback(null, undefined);
                    });
                } else {
                    callback(null, undefined);
                }
            }
        })
        .on('exit', function () { process.exit(0); });
    }, 100);
}

function neuronInvoke(opts) {
    var msg = { event: opts.EVENT, data: parseData(opts.DATA) };
    var next = function (neuron) {
        if (opts.interactive) {
            messagePump(neuron);
            startREPL(neuron, opts.NAME);
        } else {
            opts.keep ? messagePump(neuron) : process.exit(0);
        }
    };
    cli.neuronConnectService(opts.NAME, opts, function (neuron) {
        execute(neuron, opts.NAME, msg, opts.request, function () { next(neuron); });
    });
}

function neuronConnect(opts) {
    cli.neuronConnectService(opts.NAME, opts, function (neuron) {
        messagePump(neuron);
        opts.interactive && startREPL(neuron, opts.NAME);
    });
}

function registerCli(theCli) {
    cli = theCli;

    cli.neuronCmd('tool:neuron-invoke', function (cmd) {
        cmd.help('Invoke neuron endpoint')
            .option('NAME', {
                position: 1,
                required: true,
                type: 'string',
                help: 'Name of neuron endpoint'
            })
            .option('EVENT', {
                position: 2,
                required: true,
                type: 'string',
                help: 'Event name'
            })
            .option('DATA', {
                position: 3,
                required: true,
                type: 'string',
                help: 'JSON string of data'
            })
            .option('request', {
                abbr: 'r',
                flag: true,
                help: 'Invoke as a request'
            })
            .option('keep', {
                abbr: 'k',
                flag: true,
                help: 'Keep connected'
            })
            .option('interactive', {
                abbr: 'i',
                flag: true,
                help: 'Start interactive REPL'
            });
    }, neuronInvoke);

    cli.neuronCmd('tool:neuron-connect', function (cmd) {
        cmd.help('Connect neuron without sending a message')
            .option('NAME', {
                position: 1,
                required: true,
                type: 'string',
                help: 'Name of neuron endpoint'
            })
            .option('interactive', {
                abbr: 'i',
                flag: true,
                help: 'Start interactive REPL'
            });
    }, neuronConnect);
}

module.exports = {
    cli: registerCli
};
