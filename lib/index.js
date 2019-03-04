'use strict';

const Os = require('os');

const Helpers = require('./helpers');
const Bossy = require('bossy');

const DisplayError = require('./display-error');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Package = require('../package.json');

const Dogtag = require('./dog-tag');

const internals = {};

// constants
const INVALID_ARGS = 'Invalid args';
const COMMANDS_SPACING = 8;
const LOCAL_TAG_FILE_PATH = `${Os.homedir()}/doggo/local-dog-tag.gpg`;

exports.start = async (options) => {

    const args = Bossy.parse(internals.definition, {
        argv: options.argv
    });

    const log = (...logs) => {

        logs.forEach((logItem) => {

            if (String(logItem) === '[object Object]') {
                logItem = JSON.stringify(logItem, null, 4);
            }

            options.out.write(`${logItem}\n`);
        });
    };

    const ctx = { options, DisplayError };

    // Give some room for output
    log('');

    const command = (args instanceof Error) ? options.argv[2] : args._[2];
    const extraArgs = args._ || [];

    const { displayArgs } = internals;

    const doggoApiCallWithFlags = internals.doggoApiCallWithFlags.bind(this, Doggo, args);

    let err;
    let output;

    let {
        u: user,
        l: list,
        // h: help, // Currently not used, commenting for linter
        path: inputPath,
        s: search,
        v: version
    } = args;

    if (version) {
        log(`doggo-cli version: ${Package.version}`);
        return log(''); // some spacing
    }

    inputPath = inputPath || LOCAL_TAG_FILE_PATH;

    const [,,,subCommand] = extraArgs;

    switch (command) {

        case 'keys':

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'gen':

                    const genIdentifier = await Helpers.prompt('Enter user identifier for new keys');

                    ({ err, output } = await Doggo.api.genKeys(genIdentifier));

                    internals.handleError(err, command);

                    log(output);
                    break;


                case 'list':

                    ({ err, output } = await doggoApiCallWithFlags('listKeys', ['user', 'type']));

                    internals.handleError(err, command);

                    log(output);
                    break;

                case 'import':

                    ({ err, output } = await doggoApiCallWithFlags('importKey', ['path', 'type', 'password']));

                    internals.handleError(err, command);

                    log(output);
                    break;

                case 'export':

                    user = user || await Helpers.prompt('Enter user/key-identifier');

                    ({ err, output } = await Doggo.api.exportKey(user));

                    internals.handleError(err, command);

                    log(output);
                    break;

                case 'delete':

                    user = user || await Helpers.prompt('Enter user/key-identifier');

                    ({ err, output } = await Doggo.api.deleteKeys(user));

                    internals.handleError(err, command);

                    log(output);
                    break;

                default:
                    break;
            }

            break;

        case 'encrypt':

            user = user || await Helpers.prompt('Enter user/key-identifier');

            ({ err, output } = await Doggo.api.encrypt(user));

            internals.handleError(err, command);

            log(output);
            break;

        case 'decrypt':

            ({ err, output } = await Doggo.api.decrypt());

            internals.handleError(err, command);

            log(output);
            break;

        case 'gen-password':

            log(Doggo.api.genPassword());
            break;

        case 'secret':
        case 'secure':
        case 'bone':

            // TODO: Need to URL encode what we save. Right now
            // a single question mark will break everything...

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            // TODO: This needs to only show if an invalid subCommand is provided
            user = user || await Helpers.prompt('Enter user/key-identifier');

            switch (subCommand) {

                case 'list':

                    log(await Dogtag.list(inputPath, user, search));
                    break;

                case 'add':

                    await Dogtag.add(inputPath, user);
                    log(await Dogtag.list(inputPath, user, search));
                    break;

                case 'delete':
                case 'remove':

                    log(await Dogtag.delete(inputPath, user, search));
                    break;

                case 'update':
                case 'edit':

                    log(await Dogtag.update(inputPath, user, search));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;

        default:
            throw new DisplayError(`${internals.usage(ctx)}\n\n` + log(`Unknown command: ${command}`));

    }

    // Give some space
    log('');

    if (list) {
        log(await Doggo.api.listKeys(user));
    }
};

internals.definition = {
    h: {
        type: 'help',
        alias: 'help',
        description: 'show usage options',
        default: null
    },
    l: {
        type: 'boolean',
        alias: 'list',
        description: 'list keys after command',
        default: null
    },
    u: {
        type: 'string',
        alias: 'user',
        description: 'user / key-identifier',
        default: null
    },
    path: {
        type: 'string',
        description: 'path to input item',
        default: null
    },
    t: {
        type: 'string',
        alias: 'type',
        description: 'type of input item (like sec|pub)',
        default: null
    },
    p: {
        type: 'string',
        alias: 'password',
        description: 'password',
        default: null
    },
    o: {
        type: 'string',
        alias: 'output',
        description: 'output path',
        default: null
    },
    s: {
        type: 'string',
        alias: 'search',
        description: 'search string',
        default: null
    },
    v: {
        type: 'boolean',
        alias: 'version',
        description: 'doggo-cli version',
        default: null
    }
};

internals.usage = (ctx) => Bossy.usage(internals.definition, internals.usageText(ctx));

internals.commandDescription = (config) => {

    // Only allow 'regular' objects to continue
    if (!config || typeof config === 'string' || String(config) !== '[object Object]') {
        return config ? config : '';
    }

    const { subCommands } = config;
    return `(${subCommands.join(', ')})`;
};

const secretArgs = '<sub-command (list|add|(delete|remove)|(update|edit)))>';

internals.commandArgs = {
    keys: internals.commandDescription({
        subCommands: ['gen', 'list', 'delete', 'import', 'export', 'update'],
        flags: ['search']
    }),
    encrypt:  internals.commandDescription('<source-path|text> [output-path]'),
    decrypt:  internals.commandDescription('<source-path|text> [output-path]'),
    edit:     internals.commandDescription('<source-path>'),
    secret:   internals.commandDescription(secretArgs),
    secure:   internals.commandDescription(secretArgs),
    bone:     internals.commandDescription(secretArgs)
};

internals.usageText = (ctx) => {

    return `doggo <command> [options];

    Commands:
    ${Object.entries(internals.commandArgs).map(([cmd, args]) => {

        const numSpaces = COMMANDS_SPACING - cmd.length;

        return `${cmd}: ${' '.repeat(numSpaces)}${args}\n  `;
    }).join('')}`;
};

internals.handleError = (err, command) => {

    if (err && err instanceof Error) {
        if (err.message === INVALID_ARGS) {
            throw new DisplayError(internals.displayArgs(command));
        }
        else {
            throw new DisplayError(err);
        }
    }
};

internals.displayArgs = (cmd) => `usage: doggo ${cmd} ${internals.commandArgs[cmd]}`;

internals.doggoApiCallWithFlags = async (doggo, args, funcName, flagsConfig) => {

    Helpers.assert([doggo, args, funcName, flagsConfig], new Error('(doggo, args, funcName, flagsConfig) are required'));

    const flags = [].concat(flagsConfig).map((f) => args[f]);
    return await doggo.api[funcName](...flags);
};
