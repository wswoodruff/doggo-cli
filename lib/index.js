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
const INDENT_SPACING = 2;
const LOCAL_TAG_FILE_PATH = `${Os.homedir()}/doggo/local-dog-tag.gpg`;

exports.start = async (options) => {

    const args = Bossy.parse(internals.definition, {
        argv: options.argv
    });

    const log = (...logs) => {

        logs.forEach((logItem) => {

            if (String(logItem) === '[object Object]') {

                logItem = Object.entries(logItem).reduce((collector, [key, val]) => {

                    if (val instanceof Error) {
                        collector[key] = val.message;
                    }
                    else {
                        collector[key] = val;
                    }

                    return collector;
                }, {});

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

    let err;

    let {
        u: user,
        l: list,
        path,
        h: help,
        o: output,
        t: type,
        p: password,
        s: search,
        v: version,
        symmetric
    } = args;

    const listKeys = async () => {
        log('Keys:\n');
        log(await Doggo.api.listKeys(user, type));
        log('');
    };

    if (version) {
        log(`doggo-cli version: ${Package.version}`);
        return log(''); // some spacing
    }

    if (help) {
        log(`help\n`);
        log(`${internals.usage(ctx)}`);

        log(''); // Give newline

        if (list) {
            await listKeys();
        }
        return;
    }

    const [,,,subCommand] = extraArgs;

    switch (command) {

        case 'help':

            log(`help\n`);
            log(`${internals.usage(ctx)}`);

            break;

        case 'keys':

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'gen':

                    const genIdentifier = await Helpers.prompt('Enter user identifier for new keys');

                    log(await Doggo.api.genKeys(genIdentifier));
                    break;

                case 'list':

                    log(await Doggo.api.listKeys(user, type));
                    break;

                case 'import':

                    log(await Doggo.api.importKey(path, type, password));
                    break;

                case 'export':

                    user = user || await Helpers.prompt('Enter user/key-identifier');

                    log(await Doggo.api.exportKey(user, type, output, password));
                    break;

                case 'delete':

                    user = user || await Helpers.prompt('Enter user/key-identifier');
                    type = type || await Helpers.prompt('Enter key type (pub|sec|all)');

                    log(await Doggo.api.deleteKeys(user, type));
                    break;

                default:
                    break;
            }

            break;

        case 'encrypt':

            if (!symmetric) {
                user = user || await Helpers.prompt('Enter user/key-identifier');
            }

            path = path || await Helpers.prompt('Enter path to file for encryption');

            // user is who it will be encrypted to
            log(await Doggo.api.encrypt(user, path, output, symmetric));
            break;

        case 'decrypt':

            log(await Doggo.api.decrypt(path, output, password));
            break;

        case 'gen-password':

            log(Doggo.api.genPassword());
            break;

        case 'secret':

            path = path || LOCAL_TAG_FILE_PATH;

            // TODO: Need to URL encode what we save. Right now
            // a single question mark will break everything...

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            // TODO: This needs to only show if an invalid subCommand is provided
            user = user || await Helpers.prompt('Enter user/key-identifier');

            switch (subCommand) {

                case 'list':

                    log(await Dogtag.list(path, user, search));
                    break;

                case 'add':

                    await Dogtag.add(path, user);
                    log(await Dogtag.list(path, user, search));
                    break;

                case 'delete':
                case 'remove':

                    log(await Dogtag.delete(path, user, search));
                    break;

                case 'update':
                case 'edit':

                    log(await Dogtag.update(path, user, search));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;

        default:
            const errMsg = command ? `Unknown command: ${command}` : 'No command entered';
            log(`${internals.usage(ctx)}\n\n` + log(`${errMsg}\n`));
    }

    // Give some space
    log('');

    if (list) {
        await listKeys();
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
        description: 'type of input item (like sec|pub|all)',
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
    },
    symmetric: {
        type: 'boolean',
        description: 'symmetric option only used for encrypt()',
        default: null
    }
};

internals.usage = (ctx) => Bossy.usage(internals.definition, internals.usageText(ctx), { colors: true });

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
    secret:   internals.commandDescription(secretArgs)
};

internals.usageText = (ctx) => {

    const { spaces } = internals;

    const commands = Object.entries(internals.commandArgs).map(([cmd, args]) => { // Note the spacing at the beginning of this line is very important

        const flexSpacing = COMMANDS_SPACING - cmd.length;
        return `\n${spaces(INDENT_SPACING)}${cmd}:${spaces(INDENT_SPACING)}${spaces(flexSpacing)}${args}`;
    }).join('');

    return `doggo <command> [options];\n\nCommands:\n${commands}`;
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

internals.spaces = (numSpaces) => ' '.repeat(numSpaces);
