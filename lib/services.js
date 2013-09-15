var fs   = require('fs'),
    path = require('path'),
    Config = require('evo-elements').Config;

var cli;

function pidFile(name) {
    return path.join(cli.rundir, name + '.pid');
}

function serviceTitle(name) {
    return 'evo-svc: ' + name;
}

function validatePid(name) {
    var pidfile = pidFile(name);
    if (fs.existsSync(pidfile) && fs.statSync(pidfile).isFile()) {
        var pid = parseInt(fs.readFileSync(pidfile).toString());
        if (!isNaN(pid)) {
            try {
                var title = fs.readFileSync('/proc/' + pid + '/cmdline').toString().split("\0")[0];
                if (title == serviceTitle(name)) {
                    return pid;
                }
            }
            catch (e) {
                // ignored
            }
        }
    }
    return NaN;
}

function serviceExec(opts) {
    var name = opts.NAME.toLowerCase();
    var service = cli.services[name];
    if (!service) {
        throw new Error('No such service: ' + name);
    }

    var pidfile = pidFile(name);
    if (!opts.force) {
        var pid = validatePid(name);
        if (!isNaN(pid)) {
            cli.logErr(cli.warn('Service ' + name + ' is running'));
            return;
        }
    }

    var Program = require('evo-' + name).Program;
    if (!Program) {
        throw new Error('Invalid service: ' + name);
    }

    // load configurations
    var args = [];
    ['CLOUD_CFGS', 'CLOUD_CFGS_' + name].forEach(function (envVar) {
        var val = process.env[envVar];
        if (val) {
            val.split(' ').forEach(function (cfg) {
                cfg = cfg.trim();
                if (cfg.length > 0) {
                    args.push('-c');
                    args.push(path.resolve(cli.cfgdir, cfg));
                }
            });
        }
    });
    args = args.concat([
                '--rundir=' + cli.rundir,
                '--datadir=' + cli.datdir,
                '--confdir=' + cli.cfgdir
            ]);
    if (cli.logdir) {
        args.push('--logdir=' + cli.logdir);
        args.push('--logger-drivers-file={ "driver": "file", "options": { "filename": "' + path.resolve(path.join(cli.logdir, name + '.log')) + '" } }');
    }
    if (cli.loglevel) {
        args.push('--logger-level=' + cli.loglevel);
    }
    opts.config && (args = args.concat(opts.config.map(function (cfgfile) { return ['-c', cfgfile]; })));
    opts.define && (args = args.concat(opts.define.map(function (def) { return ['-D', def]; })));

    cli.debugging && cli.log('Arguments: %j', args);
    Config.conf(args, { reloadSignal: true });
    cli.debugging && cli.log('Configurations: %j', Config.conf().opts);

    // set program title
    process.title = serviceTitle(name);

    // set UID/GID
    opts.uid && process.setuid(uid);
    opts.gid && process.setgid(gid);

    // change working directory
    opts.wd && process.chdir(opts.wd);

    // save pid file
    if (opts.pid) {
        fs.writeFileSync(pidfile, process.pid.toString());
    }

    var program = new Program();
    // hook up signals
    process.on('SIGTERM', function () {
        process.nextTick(function () {
            program.stop && program.stop();
            process.exit(0);
        });
    });
    process.on('exit', function () {
        try {
            fs.unlinkSync(pidfile);
        } catch (e) {
            // ignored
        }
    });

    // start the service
    program.run();
}

function serviceSignal(names, signal) {
    names.forEach(function (name) {
        name = name.toLowerCase();
        var pid;
        try {
            pid = validatePid(name);
        } catch (e) {
            // ignored
        }
        if (pid) {
            process.kill(pid, signal);
        } else {
            cli.logErr(cli.warn('Service ' + name + ' is not running'));
        }
    });
}

function serviceKill(opts) {
    serviceSignal(opts.NAME, opts.signal || 'SIGTERM');
}

function serviceReload(opts) {
    serviceSignal(opts.NAME, 'SIGHUP');
}

function serviceStatus(opts) {
    var names = opts.NAME && opts.NAME.length > 0 ? opts.NAME : Object.keys(cli.services);
    names.forEach(function (reqName) {
        var name = reqName.toLowerCase();
        var service = cli.services[name];
        if (service) {
            var pid;
            try {
                pid = validatePid(name);
            } catch (e) {
                // ignored
            }
            cli.log(cli.pad(name, 16) + ': ' + (pid ? cli.ok('RUNNING') : cli.err('STOPPED')));
        } else {
            cli.log(cli.pad(name, 16) + ': ' + cli.lo('INVALID'));
        }
    });
}

function serviceList(opts) {
    cli.log(Object.keys(cli.services).join(' '));
}

function registerCli(instance) {
    cli = instance;

    cli.options
        .command('svc:exec')
        .help('Load and execute cloud service')
        .option('NAME', {
            position: 1,
            required: true,
            type: 'string',
            help: 'Name of the service'
        })
        .option('config', {
            abbr: 'c',
            type: 'string',
            list: true,
            help: 'Load extra configuration file'
        })
        .option('define', {
            abbr: 'D',
            type: 'string',
            list: true,
            help: 'Define configuration'
        })
        .option('pid', {
            flag: true,
            default: true,
            help: 'Save pid file'
        })
        .option('force', {
            abbr: 'f',
            flag: true,
            default: false,
            help: 'Force to execute if the service is running'
        })
        .option('uid', {
            abbr: 'u',
            metavar: 'UID',
            type: 'integer',
            help: 'Run service with UID'
        })
        .option('gid', {
            abbr: 'g',
            metavar: 'GID',
            type: 'integer',
            help: 'Run server with GID'
        })
        .option('wd', {
            abbr: 'd',
            metavar: 'DIR',
            type: 'string',
            help: 'Specify working directory'
        })
        .callback(serviceExec);

    cli.options
        .command('svc:kill')
        .help('Stop cloud service')
        .option('NAME', {
            position: 1,
            required: true,
            list: true,
            type: 'string',
            help: 'Name of the service'
        })
        .option('signal', {
            abbr: 's',
            type: 'string',
            help: 'Signal name to sent, e.g. SIGKILL'
        })
        .callback(serviceKill);

    cli.options
        .command('svc:reload')
        .help('Reload cloud service configuration')
        .option('NAME', {
            position: 1,
            required: true,
            list: true,
            type: 'string',
            help: 'Name of the service'
        })
        .callback(serviceReload);

    cli.options
        .command('svc:status')
        .help('Display cloud service status')
        .option('NAME', {
            position: 1,
            required: false,
            list: true,
            type: 'string',
            help: 'Name of the service'
        })
        .callback(serviceStatus);

    cli.options
        .command('svc:list')
        .help('List all available services')
        .callback(serviceList);

    cli.pidOf = validatePid;
}

module.exports = {
    cli: registerCli
};