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

const Utils = require('./utils');
const Dogtag = require('./dog-tag');

const INVALID_ARGS = 'Invalid args';

const internals = {};

exports.start = async (options) => {

    const args = Bossy.parse(internals.definition, {
        argv: options.argv
    });

    const output = (str) => options.out.write(`${str}\n`);
    const ctx = { options, output, DisplayError };

    // Give some room for output
    console.log('');

    const command = (args instanceof Error) ? options.argv[2] : args._[2];
    const extraArgs = args._;

    const promiseReadFile = Util.promisify(Fs.readFile);
    const promiseWriteFile = Util.promisify(Fs.writeFile)

    const { displayArgs } = internals;

    let user;

    switch (command) {

        case 'keys': {

            const [,,,subCommand, ...rest] = extraArgs;

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'gen': {

                    ({ user } = await Utils.ensureArgs({ user }));

                    const { err: genErr, output: genOutput } = await Doggo.api.genKeys(user, ...rest);

                    internals.handleError(genErr, command);

                    console.log(genOutput);
                    break;
                }

                case 'list':

                    const { err: listErr, output: listOutput } = await Doggo.api.listKeys(user, ...rest);

                    internals.handleError(listErr, command);

                    console.log(listOutput);
                    break;

                case 'import':

                    const cwd = options.cwd;

                    const { err: importErr, output: importOutput } = await Doggo.api.importKey(...rest);

                    internals.handleError(importErr, command);

                    console.log(importOutput);
                    break;

                case 'export':

                    ({ user } = await Utils.ensureArgs({ user }));

                    const { err: exportErr, output: exportOutput } = await Doggo.api.exportKey(user, ...rest);

                    internals.handleError(exportErr, command);

                    console.log(exportOutput);
                    break;

                case 'delete':

                    ({ user } = await Utils.ensureArgs({ user }));

                    const { err: deleteErr, output: deleteOutput } = await Doggo.api.deleteKeys(user, ...rest);

                    internals.handleError(deleteErr, command);

                    console.log(deleteOutput);
                    break;

                default:
                    break;
            }
            break;
        }

        case 'encrypt': {

            const [,,,...rest] = extraArgs;

            ({ user } = await Utils.ensureArgs({ user }));

            const { err: encryptErr, output: encryptOutput } = await Doggo.api.encrypt(user, ...rest);

            internals.handleError(encryptErr, command);

            console.log(encryptOutput);
            break;
        }
        case 'decrypt': {

            const [,,,...rest] = extraArgs;

            const { err: decryptErr, output: decryptOutput } = await Doggo.api.decrypt(...rest);

            internals.handleError(decryptErr, command);

            console.log(decryptOutput);
            break;
        }
        case 'gen-password': {

            console.log(Doggo.api.genPassword());
            break;
        }
        case 'secret':
        case 'secure':
        case 'bone': {

            console.log('TODO: Need to URL encode what we save. Right now a single question mark will break everything...\n');

            const [,,,subCommand, ...rest] = extraArgs;

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'list':

                    console.log(await Dogtag.list(user));
                    break;

                case 'add':

                    ({ user } = await Utils.ensureArgs({ user }));

                    const { output: addOutput } = await Dogtag.add(user);
                    console.log(await Dogtag.list(user));

                    break;

                case 'delete':
                case 'remove':

                    ({ user } = await Utils.ensureArgs({ user }));

                    console.log(await Dogtag.delete(user, ...rest));
                    break;

                case 'update':

                    ({ user } = await Utils.ensureArgs({ user }));

                    const { output: updateOutput } = await Dogtag.update(user, ...rest);

                    if (updateOutput.includes('No result found')) {
                        // NOTE: This is definitely temporary
                        // until we start handling standard errors with help
                        // from constants for times when we search and no
                        // results were found
                        console.log({ err: updateOutput });
                    }

                    console.log(await Dogtag.list(user));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;
        }

        case 'edit': {

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

            const { err } = await Doggo.api.decrypt(src, tmpF.path);

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
        }
        default: {
            throw new DisplayError(`${internals.usage(ctx)}\n\n` + console.log(`Unknown command: ${command}`));
        }
    }

    // Give some space
    console.log('');

    if (args.l || args.list) {
        console.log(await Doggo.api.listKeys(user));
    }
};

internals.definition = {
    help: {
        type: 'boolean',
        alias: 'h',
        description: 'show usage options',
        default: null
    },
    list: {
        type: 'boolean',
        alias: 'l',
        description: 'list keys after command',
        default: null
    },
    user: {
        alias: 'u',
        description: 'user / key-identifier',
        default: null
    }
};

internals.usage = (ctx) => Bossy.usage(internals.definition, internals.usageText(ctx));

const secretArgs = '<sub-command (list, add, (delete|remove), edit)>';

internals.commandArgs = {
    keys:     '<sub-command (gen|list|delete|import|export)> [list: key-type | export: dest-file]',
    encrypt:  '<source-path|text> [output-path]',
    decrypt:  '<source-path|text> [output-path]',
    edit:     '<source-path>',
    secret:   secretArgs,
    secure:   secretArgs,
    bone:     secretArgs
};

internals.usageText = (ctx) => `doggo <command> [options]

Commands:
  ${Object.entries(internals.commandArgs).map(([cmd, args]) => {

      const SPACING = 8;
      const numSpaces = SPACING - cmd.length;

      return `${cmd}: ${' '.repeat(numSpaces)}${args}\n  `;
  }).join('')}
`;

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

internals.displayArgs = (cmd) => console.log(`usage: doggo ${cmd} ${internals.commandArgs[cmd]}`);
