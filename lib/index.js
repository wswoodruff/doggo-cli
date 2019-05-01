'use strict';

const Os = require('os');
const Path = require('path');
const Fs = require('fs').promises;

const Automerge = require('automerge');
const Bossy = require('bossy');
const Helpers = require('./helpers');

const DisplayError = require('./display-error');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Package = require('../package.json');
const DoggoPackage = require('doggo/package.json');
const DoggoAdapterGpgPackage = require('doggo-adapter-gpg/package.json');

const Dotenv = require('dotenv');
// Pull .env into process.env
Dotenv.config({ path: `${__dirname}/../.env` });

const Dogtag = require('./dog-tag');
const RemoteManager = require('./remote-manager');

const internals = {};

// constants
const INVALID_ARGS = 'Invalid args';
const COMMANDS_SPACING = 8;
const INDENT_SPACING = 2;
const LOCAL_TAG_FILE_PATH = `${Os.homedir()}/doggo/local-dog-tag.gpg`;
const DEFAULT_DOG_TAG_NAME = 'default-dog-tag';

const DOGGO_DISH_DEFAULT_REMOTE_PATH = process.env.API_HOST || 'http://localhost:4000';

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
        h: help,
        o: output,
        t: type,
        p: path,
        password,
        s: search,
        v: version,
        symmetric
    } = args;

    if (path) {
        path = Path.isAbsolute(path) ? path : Path.resolve(process.cwd(), path);
    }

    const listKeys = async () => {
        log('Keys:\n');
        log(await Doggo.api.listKeys(user, type));
        log('');
    };

    if (version) {
        log(`doggo-cli version: ${Package.version}\ndoggo version: ${DoggoPackage.version}\ndoggo-adapter-gpg version: ${DoggoAdapterGpgPackage.version}`);
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

        case 'key':
        case 'keys':

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'gen':
                case 'add':

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

        case 'secret':
        case 'secrets':

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

        case 'remote':

            user = user || await Helpers.prompt('Enter user/key-identifier');

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'list':

                    log('');
                    log(await RemoteManager.listRemotes());
                    break;

                case 'add':

                    // Part of getting you a remote is logging you in,
                    // storing a valid jwt

                    const remoteUrl = await Helpers.prompt('Enter remote url');

                    const addRemotes = await RemoteManager.listRemotes();

                    if (addRemotes.includes(remoteUrl)) {
                        throw new Error(`Remote "${remoteUrl}" already exists!`);
                    }

                    const addJwt = await RemoteManager.syncRemote(remoteUrl, user, password);

                    console.log(`Successfully added remote "${remoteUrl}" and have valid jwt`);
                    break;

                case 'sync':

                    const remotes = await RemoteManager.listRemotes();

                    let remoteToSync;

                    if (remotes.length === 0) {

                        const shouldCreateRemote = await Helpers.prompt('You have no remotes. Create one now?', 'confirm');

                        let syncRemoteUrl;

                        if (!shouldCreateRemote) {
                            console.log('Must have a remote configured to continue');
                            return;
                        }

                        remoteToSync = await Helpers.prompt('Enter remote url');
                    }
                    else if (remotes.length === 1){

                        if (!await Helpers.prompt(`Only one remote exists. Sync remote "${remotes[0]}"?`, 'confirm')) {
                            console.log('Must select a remote to continue');
                            return;
                        }

                        remoteToSync = remotes[0];
                    }
                    else {
                        remoteToSync = Helpers.prompt('Please select a remote', 'select', remotes);
                    }

                    const syncJwt = await RemoteManager.syncRemote(remoteToSync, user, password);

                    let { results: secrets } = await RemoteManager.listSecrets(syncJwt, remoteToSync);

                    secrets = secrets ? secrets.map(({ name }) => name) : [];

                    // Currently we only support syncing your 'DEFAULT_DOG_TAG_NAME'
                    // We need some structure around the local secrets in order to properly
                    // sync with a server. We need to give names to secrets that point to
                    // their local paths

                    if (secrets.includes(DEFAULT_DOG_TAG_NAME)) {
                        const remoteSecret = await RemoteManager.getSecret(syncJwt, remoteToSync, DEFAULT_DOG_TAG_NAME);

                        const { output: decryptedRemoteTag } = await Doggo.api.decrypt(remoteSecret);

                        // 'decryptedRemoteTag' is now the output of Automerge.save, so it's JSON stringified
                        const { output: remoteTag } = await Dogtag.getInstance(decryptedRemoteTag);
                        const { output: localTag } = await Dogtag.getInstance(LOCAL_TAG_FILE_PATH, user);

                        const mergedTag = Dogtag.merge(localTag, remoteTag);

                        await Dogtag.save(LOCAL_TAG_FILE_PATH, user, mergedTag);

                        log('');
                        log('Merged remote default tag with local tag!');

                        const { output: encryptedMergedTag, err } = await Doggo.api.encrypt(user, Dogtag.getAutomergeSave(mergedTag));

                        if (err) {
                            throw err;
                        }

                        await RemoteManager.updateSecret(syncJwt, remoteToSync, {
                            secret: encryptedMergedTag,
                            name: DEFAULT_DOG_TAG_NAME
                        });

                        log('');
                        log('Uploaded merged tag to remote!');
                    }
                    else {
                        // Grab the secret and upload it
                        // TODO stream this up instead of loading it in memory here
                        const res = await RemoteManager.addSecret(syncJwt, remoteToSync, {
                            secret: await Fs.readFile(LOCAL_TAG_FILE_PATH, { encoding: 'utf8' }),
                            name: DEFAULT_DOG_TAG_NAME,
                            type: 'dog-tag'
                        });

                        log('');
                        log('Uploaded default tag to remote!');
                    }

                    // const userSecret = await RemoteManager.getSecret(jwt, path, 'doggo-test');
                    // const userSecret = await RemoteManager.getSecret(jwt, path, 'newbie');
                    // console.log('userSecret', userSecret);

                    log('');
                    log(`Synced with server "${remoteToSync}"!`);

                    break;
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
    p: {
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
    password: {
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
        subCommands: ['gen|add', 'list', 'delete', 'import', 'export'],
        flags: ['search']
    }),
    encrypt: internals.commandDescription('<source-path|text> [output-path]'),
    decrypt: internals.commandDescription('<source-path|text> [output-path]'),
    edit:    internals.commandDescription('<source-path>'),
    secret:  internals.commandDescription(secretArgs),
    remote:  internals.commandDescription('<sub-command (sync)>')
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

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
