'use strict';

const Path = require('path');
const Fs = require('fs').promises;
const Util = require('util');

const Bossy = require('bossy');

const Mkdirp = require('mkdirp');

const Helpers = require('./helpers');
const DisplayError = require('./display-error');

// Init doggo instance
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

// BIG TODO TODO TODO TODO
// Having an issue with doggo-adapter-gpg where if enough time has passed to uncache
// validation for a key on gpg-agent, pinentry won't come up anymore

// constants
const {
    COMMANDS_SPACING,
    INDENT_SPACING,
    LOCAL_TAG_FILE_PATH,
    LOCAL_REMOTES_PATH,
    DEFAULT_DOG_TAG_NAME
} = require('./constants');

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
            else if (Array.isArray(logItem)) {
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

    let {
        u: user,
        l: list,
        h: help,
        o: output,
        t: type,
        k: keyType, // Will get set to the 'type' var if 't' is not defined
        p: path,
        password,
        s: search,
        v: version,
        symmetric
    } = args;

    type = type || keyType;

    if (path) {
        path = Path.isAbsolute(path) ? path : Path.resolve(process.cwd(), path);
    }

    const listKeys = async () => {

        log('Keys:\n');
        log(await Helpers.withErrHandling(Doggo.api.listKeys, user, type));
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
                user = await Helpers.pickUser(user);
            }

            path = path || await Helpers.prompt('Enter path to file for encryption');

            // user is who it will be encrypted to
            log(await Helpers.withErrHandling(Doggo.api.encrypt, user, path, output, symmetric));
            break;

        case 'decrypt':

            log(await Helpers.withErrHandling(Doggo.api.decrypt, path, output, password));
            break;

        case 'gen-password':

            log(await Helpers.withErrHandling(Doggo.api.genPassword));
            break;

        case 'key':
        case 'keys': {

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'gen':
                case 'add':

                    const genIdentifier = await Helpers.prompt('Enter user identifier for new keys');

                    log(await Helpers.withErrHandling(Doggo.api.genKeys, genIdentifier));
                    break;

                case 'list':

                    log(await Helpers.withErrHandling(Doggo.api.listKeys, user, type));
                    break;

                case 'import':

                    log(await Helpers.withErrHandling(Doggo.api.importKey, path, type, password));
                    break;

                case 'export':

                    user = await Helpers.pickUser(user, 'sec', 'Pick exporting user');
                    type = type || await Helpers.prompt('Enter key type ([pub|sec|all])');

                    log(await Helpers.withErrHandling(Doggo.api.exportKey, user.fingerprint, type, output, password));
                    break;

                case 'delete':

                    user = await Helpers.pickUser(user);
                    type = type || await Helpers.prompt('Enter key type ([pub|sec|all])');

                    log(await Helpers.withErrHandling(Doggo.api.deleteKeys, user.fingerprint, type));
                    break;

                default:
                    break;
            }

            break;
        }

        case 'secret':
        case 'secrets': {

            user = await Helpers.pickUser(user, 'sec', 'Pick acting user');

            await internals.ensureLocalTag(user);

            const USER_LOCAL_TAG_FILE_PATH = LOCAL_TAG_FILE_PATH(user.fingerprint);

            path = path || USER_LOCAL_TAG_FILE_PATH;

            // TODO: Need to URL encode what we save. Right now
            // a single question mark will break everything...

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            // TODO: This needs to only show if an invalid subCommand is provided

            switch (subCommand) {

                case 'list':

                    log(await Helpers.withErrHandling(Dogtag.list, path, user, search));
                    break;

                case 'add': {

                    const updatedTag = await Helpers.withErrHandling(Dogtag.add, path, user.fingerprint, output);
                    log('updatedTag', updatedTag);
                    await Helpers.withErrHandling(Dogtag.encryptAndSave, USER_LOCAL_TAG_FILE_PATH, user.fingerprint, updatedTag);
                    log('Success');
                    break;
                }

                case 'delete':
                case 'remove': {

                    const updatedTag = await Helpers.withErrHandling(Dogtag.delete, path, user, search);
                    await Helpers.withErrHandling(Dogtag.encryptAndSave, USER_LOCAL_TAG_FILE_PATH, user.fingerprint, updatedTag);
                    log('Success');
                    break;
                }

                case 'update':
                case 'edit': {

                    const updatedTag = await Helpers.withErrHandling(Dogtag.update, path, user, search);
                    await Helpers.withErrHandling(Dogtag.encryptAndSave, USER_LOCAL_TAG_FILE_PATH, user.fingerprint, updatedTag);
                    log('Success');
                    break;
                }

                case 'share':
                    //////// TODO
                    // Share to a remote

                    const toShareUser = await Helpers.pickUser('', 'pub', 'Pick receiving user');

                    if (toShareUser.fingerprint === user.fingerprint) {
                        throw new Error('Acting user cannot share with itself');
                    }

                    // TODO implement this
                    // log(await Helpers.withErrHandling(RemoteManager.shareSecret, user, toShareUser, search));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;
        }

        case 'remote': {

            user = await Helpers.pickUser(user, 'sec', 'Pick acting user');

            const USER_LOCAL_TAG_FILE_PATH = LOCAL_TAG_FILE_PATH(user.fingerprint);

            await internals.ensureLocalTag(user);
            await internals.ensureLocalRemotes(user);

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'list':

                    log('');
                    await Helpers.withErrHandling(RemoteManager.listRemotes, user);
                    break;

                case 'add':

                    // Part of getting you a remote is logging you in,
                    // storing a valid jwt

                    const remoteUrl = await Helpers.prompt('Enter remote url');

                    const addRemotes = await Helpers.withErrHandling(RemoteManager.listRemotes, user);

                    if (addRemotes.includes(remoteUrl)) {
                        throw new Error(`Remote "${remoteUrl}" already exists!`);
                    }

                    await Helpers.withErrHandling(RemoteManager.addRemote, remoteUrl, user, password);

                    log(`Successfully added remote "${remoteUrl}" and have valid jwt`);
                    break;

                case 'sync': {

                    const remotes = await Helpers.withErrHandling(RemoteManager.listRemotes, user.fingerprint);

                    let remoteToSync;

                    if (remotes.length === 0) {

                        if (!await Helpers.prompt('You have no remotes. Create one now?', 'confirm')) {
                            log('Must have a remote configured to continue');
                            return;
                        }

                        remoteToSync = await Helpers.prompt('Enter remote url');
                    }
                    else if (remotes.length === 1){

                        if (!await Helpers.prompt(`Only one remote exists. Sync remote "${remotes[0]}"?`, 'confirm')) {
                            log('Must select a remote to continue');
                            return;
                        }

                        remoteToSync = remotes[0];
                    }
                    else {
                        remoteToSync = await Helpers.prompt('Please select a remote', 'select', remotes);
                    }

                    const userPubKey = await internals.getUserKey('pub', user);

                    const syncJwt = await Helpers.withErrHandling(RemoteManager.syncRemote, remoteToSync, { ...user, pubKey: userPubKey }, password);
                    let secrets = await Helpers.withErrHandling(RemoteManager.listSecrets, syncJwt, remoteToSync);

                    secrets = (secrets || []).map(({ name }) => name);

                    // Currently we only support syncing your 'DEFAULT_DOG_TAG_NAME'
                    // We need some structure around the local secrets in order to properly
                    // sync with a server. We need to give names to secrets that point to
                    // their local paths

                    if (secrets.includes(DEFAULT_DOG_TAG_NAME)) {

                        const remoteSecret = await Helpers.withErrHandling(RemoteManager.fetchSecret, syncJwt, remoteToSync, DEFAULT_DOG_TAG_NAME);

                        log('');
                        log('Fetched remote dogtag!');

                        const decryptedRemoteTag = await Helpers.withErrHandling(Doggo.api.decrypt, remoteSecret);

                        // 'decryptedRemoteTag' should now be the output of Automerge.save,
                        // so it's JSON stringified and ready to be put into Automerge.load()
                        // (used in Dogtag.getInstance)
                        const remoteTag = await Helpers.withErrHandling(Dogtag.getInstance, decryptedRemoteTag, user);

                        const decryptedLocalTag = await Helpers.withErrHandling(Doggo.api.decrypt, USER_LOCAL_TAG_FILE_PATH);
                        const localTag = await Helpers.withErrHandling(Dogtag.getInstance, decryptedLocalTag, user);

                        const diff = Dogtag.diff(remoteTag, localTag);

                        if (!diff.length) {
                            log('');
                            log('Remote and local tags are equal!');
                        }
                        else {
                            // TODO need to do a super security upgrade on this merge
                            // Who knows what's in that remoteTag?
                            // At _least_ assert a Joi schema
                            // OK here's what we'll do. For your uploaded default dog-tag,
                            // we'll have you set a password for it and encrypt it symmetrically
                            // problem solved!
                            const mergedTag = Dogtag.merge(localTag, remoteTag);

                            await Helpers.withErrHandling(Dogtag.encryptAndSave, USER_LOCAL_TAG_FILE_PATH, user.fingerprint, mergedTag);

                            log('');
                            log('Merged remote tag with local default tag!');

                            const encryptedMergedTag = await Helpers.withErrHandling(Doggo.api.encrypt, user.fingerprint, await Helpers.withErrHandling(Dogtag.getAutomergeSave, mergedTag));

                            await Helpers.withErrHandling(RemoteManager.updateSecret, syncJwt, remoteToSync, {
                                secret: encryptedMergedTag,
                                name: DEFAULT_DOG_TAG_NAME
                            });

                            log('');
                            log('Uploaded merged tag to remote!');
                        }
                    }
                    else {
                        // Grab the secret and upload it
                        // TODO stream this up instead of loading it in memory here
                        await Helpers.withErrHandling(RemoteManager.addSecret, syncJwt, remoteToSync, {
                            secret: await Fs.readFile(USER_LOCAL_TAG_FILE_PATH, { encoding: 'utf8' }),
                            name: DEFAULT_DOG_TAG_NAME,
                            type: 'dog-tag'
                        });

                        log('');
                        log('Uploaded default tag to remote!');
                    }

                    log('');
                    log(`Synced with server "${remoteToSync}"!`);

                    break;
                }
            }

            break;
        }

        default:
            const errMsg = command ? `Unknown command: "${command}"` : 'No command entered';
            log(`${internals.usage(ctx)}\n\n`);
            log(`${errMsg}\n`);
            break;
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
    k: {
        // NOTE: '-k' or '--key' is set to 'type' in CLI logic if '-t' or '--type' is not specified.
        // Sometimes '-k' makes more sense.
        // IMPORTANT: 'type' wins in a tie between 'type' and 'key'
        // Do not specify '-t' and '-k' together as CLI args
        type: 'string',
        alias: 'key',
        description: 'type of key (like sec|pub|all)',
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

internals.displayArgs = (cmd) => `usage: doggo ${cmd} ${internals.commandArgs[cmd]}`;

internals.spaces = (numSpaces) => ' '.repeat(numSpaces);

internals.save = async (path, data) => {

    await Util.promisify(Fs.writeFile)(path, data);

    return data;
};

internals.encryptAndSave = async (path, fingerprint, data) => {

    const encryptedData = await Helpers.withErrHandling(Doggo.api.encrypt, fingerprint, data);
    return await internals.save(path, encryptedData);
};

internals.ensureLocalTag = async ({ fingerprint }) => {

    const USER_LOCAL_TAG_FILE_PATH = LOCAL_TAG_FILE_PATH(fingerprint);

    if (!await Helpers.fileExists(USER_LOCAL_TAG_FILE_PATH)) {

        // Ensure intermediate directories for USER_LOCAL_TAG_FILE_PATH
        await Util.promisify(Mkdirp)(USER_LOCAL_TAG_FILE_PATH.split('/').slice(0, -1).join('/'));
        await internals.encryptAndSave(USER_LOCAL_TAG_FILE_PATH, fingerprint, Dogtag.init());
    }

    return USER_LOCAL_TAG_FILE_PATH;
};

internals.ensureLocalRemotes = async ({ fingerprint }) => {

    const USER_LOCAL_REMOTES_PATH = LOCAL_REMOTES_PATH(fingerprint);

    if (!await Helpers.fileExists(USER_LOCAL_REMOTES_PATH)) {

        // Ensure intermediate directories for USER_LOCAL_TAG_FILE_PATH
        await Util.promisify(Mkdirp)(USER_LOCAL_REMOTES_PATH.split('/').slice(0, -1).join('/'));
        await internals.encryptAndSave(USER_LOCAL_REMOTES_PATH, fingerprint, RemoteManager.init());
    }

    return USER_LOCAL_REMOTES_PATH;
};

internals.getUserKey = async (keyType, user) => {

    return await Helpers.withErrHandling(Doggo.api.exportKey, user.fingerprint, keyType);
};

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
