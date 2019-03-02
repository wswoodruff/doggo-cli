'use strict';

const Fs = require('fs');
const Util = require('util');
const Path = require('path');
const SpawnSync = require('child_process').spawnSync;

const Helpers = require('./helpers');
const Bossy = require('bossy');
const Tmp = require('tmp-promise');
const Enquirer = require('enquirer');

const DisplayError = require('./display-error');
const Print = require('./print');
const Package = require('../package.json');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Dogtag = require('./dog-tag');

const internals = {};

// constants
const INVALID_ARGS = 'Invalid args';
const COMMANDS_SPACING = 8;

exports.start = async (options) => {

    const args = Bossy.parse(internals.definition, {
        argv: options.argv
    });

    const log = (...logs) => {

        logs.forEach((logItem) => {

            if (String(logItem) === '[object Object]') {
                logItem = JSON.stringify(logItem, null, 4);
            }

            options.out.write(`${logItem}\n`)
        });
    };

    const ctx = { options, DisplayError };

    // Give some room for output
    log('');

    const command = (args instanceof Error) ? options.argv[2] : args._[2];
    const extraArgs = args._ || [];

    const promiseReadFile = Util.promisify(Fs.readFile);
    const promiseWriteFile = Util.promisify(Fs.writeFile)

    const { displayArgs } = internals;

    const doggoApiCallWithFlags = internals.doggoApiCallWithFlags.bind(this, Doggo, args);

    let err, output;
    let {
        u: user,
        l: list,
        h: help,
        path: inputPath,
        t: type,
        p: password,
        o: outputPath,
        s: search
    } = args;

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

                    log(await Dogtag.list(user, search));
                    break;

                case 'add':

                    await Dogtag.add(user);
                    log(await Dogtag.list(user, search));
                    break;

                case 'delete':
                case 'remove':

                    log(await Dogtag.delete(user, search));
                    break;

                case 'update':
                case 'edit':

                    log(await Dogtag.update(user, search));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;

        case 'edit':

            const [,,,src] = extraArgs;

            if (!user || !src) {
                throw new DisplayError(displayArgs(command));
            }

            const srcContents = await promiseReadFile(src);
            const backup = src + '.bak';

            // First things first, backup
            await promiseWriteFile(backup, srcContents);

            let editContents = srcContents;

            const tmpF = await Tmp.file();
            Tmp.setGracefulCleanup();

            ({ err } = await Doggo.api.decrypt(src, tmpF.path));

            if (!err) {
                editContents = await promiseReadFile(tmpF.path);
            }

            await promiseWriteFile(tmpF.path, editContents);

            const processOptions = {
                stdio: ['inherit', 'inherit', 'inherit']
            };

            const editor = process.env.EDITOR || 'vim';

            SpawnSync(editor, [tmpF.path], { stdio: 'inherit' });

            const srcNoGpgExt = src.replace(/\.gpg$/, '');

            await Doggo.api.encrypt(user, tmpF.path, `${srcNoGpgExt}.gpg`);

            tmpF.cleanup();

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
    }
};

internals.usage = (ctx) => Bossy.usage(internals.definition, internals.usageText(ctx));

internals.commandDescription = (config) => {

    // Only allow 'regular' objects to continue
    if (!config || typeof config === 'string' || String(config) !== '[object Object]') {
        return config ? config : '';
    }

    const { subCommands, flags } = config;
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

internals.usageText = (ctx) => `doggo <command> [options]

Commands:
  ${Object.entries(internals.commandArgs).map(([cmd, args]) => {

      const numSpaces = COMMANDS_SPACING - cmd.length;

      return `${cmd}: ${' '.repeat(numSpaces)}${args}\n  `;
  }).join('')}`;

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
