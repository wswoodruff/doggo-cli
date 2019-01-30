'use strict';

const Fs = require('fs');
const Util = require('util');
const Path = require('path');
const SpawnSync = require('child_process').spawnSync;

const Helpers = require('./helpers');
const Bossy = require('bossy');
const Tmp = require('tmp-promise');

const DisplayError = require('./display-error');
const Print = require('./print');
const Package = require('../package.json');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Dogtag = require('./dog-tag');

const INVALID_ARGS = 'Invalid args';

const internals = {};

exports.start = async (options) => {

    const args = Bossy.parse(internals.definition, {
        argv: options.argv
    });

    const output = (str) => options.out.write(`${str}\n`);
    const colors = Print.colors(options.colors);
    const ctx = { options, colors, output, DisplayError };

    // Give some room for output
    ctx.output('');

    const command = (args instanceof Error) ? options.argv[2] : args._[2];
    const extraArgs = args._;

    const promiseReadFile = Util.promisify(Fs.readFile);
    const promiseWriteFile = Util.promisify(Fs.writeFile)

    const displayArgs = (cmd) => colors.red(`usage: doggo ${cmd} ${internals.commandArgs[cmd]}`);

    switch (command) {

        case 'gen': {

            const [,,,identifier, comment, email] = extraArgs;

            if (!identifier) {
                throw new DisplayError(displayArgs(command));
            }

            const { output: genOutput } = await Doggo.api.genKeys(identifier, comment, email)

            ctx.output(genOutput);
            break;
        }
        case 'keys':

            const [,,,subCommand, ...rest] = extraArgs;

            Helpers.assert(subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'list':

                    const { err: listErr, output: listOutput } = await Doggo.api.listKeys(...rest);

                    if (listErr && listErr instanceof Error) {
                        if (listErr.message === INVALID_ARGS) {
                            throw new DisplayError(displayArgs(command));
                        }
                    }

                    console.log(listOutput);
                    break;

                case 'export': {

                    const { err: exportErr, output: exportOutput } = await Doggo.api.exportKey(...rest);

                    if (exportErr && exportErr instanceof Error) {
                        if (exportErr.message === INVALID_ARGS) {
                            throw new DisplayError(displayArgs(command));
                        }
                    }

                    console.log(exportOutput);
                    break;
                }

                case 'import': {

                    const cwd = options.cwd;

                    const srcFile = src ? Path.resolve(cwd, src) : src;

                    const { err: importErr, output: importOutput } = await Doggo.api.importKey(srcFile, keyType);

                    if (importErr && importErr instanceof Error) {
                        if (importErr.message === INVALID_ARGS) {
                            throw new DisplayError(displayArgs(command));
                        }
                    }

                    console.log(importOutput);
                    break;
                }

                default:
                    break;
            }

            // case 'list': {
            //
            //     const [,,,keyIdentifier, keyType] = extraArgs;
            //     console.log(await Doggo.api.listKeys(keyIdentifier, keyType));
            //     break;
            // }
            break;

        case 'encrypt': {

            const cwd = options.cwd;

            const [,,,keyIdentifier, src, dest] = extraArgs;
            let [,,,,,,symmetric] = extraArgs;
            symmetric = String(symmetric).toLowerCase() === 'true' ? true : false;

            if (!keyIdentifier || !src) {
                throw new DisplayError(displayArgs(command));
            }

            const srcFile = src ? Path.resolve(cwd, src) : src;
            const destFile = dest ? Path.resolve(cwd, dest) : dest;

            const { output: encryptOutput } = await Doggo.api.encrypt(keyIdentifier, srcFile, destFile, symmetric);

            ctx.output('output: ' + encryptOutput);
            break;
        }
        case 'decrypt': {

            const cwd = options.cwd;

            const [,,,src, dest] = extraArgs;

            if (!src) {
                throw new DisplayError(displayArgs(command));
            }

            const srcFile = src ? Path.resolve(cwd, src) : src;
            const destFile = dest ? Path.resolve(cwd, dest) : dest;

            const { output: decryptOutput } = await Doggo.api.decrypt(srcFile, destFile);

            ctx.output('output: ' + decryptOutput);
            break;
        }
        case 'delete': {

            const [,,,keyIdentifier, keyType] = extraArgs;

            if (!keyIdentifier || !keyType) {
                throw new DisplayError(displayArgs(command));
            }

            const { output: deleteOutput } = await Doggo.api.deleteKeys(keyIdentifier, keyType);

            ctx.output(deleteOutput);
            break;
        }
        case 'gen-password': {

            ctx.output(Doggo.api.genPassword());
            break;
        }
        case 'secret':
        case 'secure':
        case 'bone': {

            console.log('TODO: Need to URL encode what we save. Right now a single question mark will break everything...\n');

            const [,,,keyIdentifier, subCommand, ...rest] = extraArgs;

            Helpers.assert(keyIdentifier && subCommand, new DisplayError(displayArgs(command)));

            switch (subCommand) {

                case 'list':

                    console.log(await Dogtag.list(null, keyIdentifier));
                    break;

                case 'add':

                    const { output: addOutput } = await Dogtag.add(null, keyIdentifier);
                    console.log(await Dogtag.list(null, keyIdentifier));

                    break;

                case 'delete':
                case 'remove':

                    console.log(await Dogtag.delete(null, keyIdentifier, rest[0]));
                    break;

                case 'update':

                    const { output: updateOutput } = await Dogtag.update(null, keyIdentifier, rest[0]);

                    if (updateOutput.includes('No result found')) {
                        // NOTE: This is definitely temporary
                        // until we start handling standard errors with help
                        // from constants for times when we search and no
                        // results were found
                        console.log({ err: updateOutput });
                    }

                    console.log(await Dogtag.list(null, keyIdentifier));
                    break;

                default:
                    throw new DisplayError(displayArgs(command));
            }

            break;
        }
        case 'edit': {

            const [,,,keyIdentifier, src] = extraArgs;

            if (!keyIdentifier || !src) {
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

            await Doggo.api.encrypt(keyIdentifier, tmpF.path, `${srcNoGpgExt}.gpg`);

            tmpF.cleanup();

            break;
        }
        default: {
            throw new DisplayError(`${internals.usage(ctx)}\n\n` + colors.red(`Unknown command: ${command}`));
        }
    }

    // Give some space
    console.log('');

    if (args.l || args.list) {
        console.log(await Doggo.api.listKeys());
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
    }
};

internals.usage = (ctx) => Bossy.usage(internals.definition, internals.usageText(ctx), { colors: ctx.options.colors });

internals.commandArgs = {
    gen:      '<key-identifier>',
    keys:     '<sub-command (list|export)> <key-identifier> [(list: key-type | export: dest-file)]',
    encrypt:  '<source-path|text> [output-path]',
    decrypt:  '<source-path|text> [output-path]',
    export:   '<key-type> <key-identifier> [dest-file]',
    import:   '<source-path> <key-type>',
    delete:   '<key-identifier> <key-type>',
    edit:     '<key-identifier> <source-path>',
    secret:   '<key-identifier> <sub-command (list, add, (delete|remove), edit)>',
    secure:   '<key-identifier> <sub-command (list, add, (delete|remove), edit)>',
    bone:     '<key-identifier> <sub-command (list, add, (delete|remove), edit)>'
};

internals.usageText = (ctx) => `doggo <command> [options]

Commands:
  ${Object.entries(internals.commandArgs).map(([cmd, args]) => {

      const SPACING = 8;
      const numSpaces = SPACING - cmd.length;

      return `${cmd}: ${' '.repeat(numSpaces)}${args}\n  `;
  }).join('')}
`;
