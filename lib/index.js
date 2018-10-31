'use strict';

const Path = require('path');
const Bossy = require('bossy');
const DisplayError = require('./display-error');
const Print = require('./print');
const Package = require('../package.json');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

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

    const commandAndPart = (args instanceof Error) ? options.argv[2] : args._[2];
    const extraArgs = args._;

    switch (commandAndPart) {

        case 'gen': {

            const identifier = extraArgs[3];
            const comment = extraArgs[4];
            const email = extraArgs[5];

            if (!identifier) {
                throw new DisplayError(colors.red('Must specify identifier'));
            }

            const password = extraArgs[4];

            const { output: genOutput } = await Doggo.api.genKeys(identifier, comment, email)

            ctx.output(genOutput);
            break;
        }
        case 'list': {

            const keyIdentifier = extraArgs[3];
            const keyType = extraArgs[4];

            console.log(await Doggo.api.listKeys(keyIdentifier, keyType));
            break;
        }
        case 'encrypt': {

            const cwd = options.cwd;

            const keyIdentifier = extraArgs[3];
            const src = extraArgs[4];
            const dest = extraArgs[5];
            const symmetric = String(extraArgs[6]).toLowerCase() === 'true' ? true : false;

            if (!keyIdentifier) {
                throw new DisplayError(colors.red('Must specify key identifier as first argument'));
            }

            if (!src) {
                throw new DisplayError(colors.red('Must specify source path as second argument'));
            }

            const srcFile = src ? Path.resolve(cwd, src) : src;
            const destFile = dest ? Path.resolve(cwd, dest) : dest;

            const { output: encryptOutput } = await Doggo.api.encrypt(keyIdentifier, srcFile, destFile, symmetric);

            ctx.output('output: ' + encryptOutput);
            break;
        }
        case 'decrypt': {

            const cwd = options.cwd;

            const src = extraArgs[3];
            const dest = extraArgs[4];

            if (!src) {
                throw new DisplayError(colors.red('Must specify source path as first argument'));
            }

            const srcFile = src ? Path.resolve(cwd, src) : src;
            const destFile = dest ? Path.resolve(cwd, dest) : dest;

            const { output: decryptOutput } = await Doggo.api.decrypt(srcFile, destFile);

            ctx.output('output: ' + decryptOutput);
            break;
        }
        case 'export': {

            const cwd = options.cwd;

            const keyIdentifier = extraArgs[3];
            const keyType = extraArgs[4];
            const destFile = extraArgs[5];

            if (!keyIdentifier) {
                throw new DisplayError(colors.red('Must specify key identifier as first argument'));
            }

            if (!keyType) {
                throw new DisplayError(colors.red('Must specify key type as second argument'));
            }

            if (!destFile && keyType === 'sec') {
                throw new DisplayError(colors.red('Must specify file name as third argument if key type is "sec"'));
            }

            const { output: exportOutput } = await Doggo.api.exportKey(keyIdentifier, keyType, destFile);

            ctx.output(exportOutput);
            break;
        }
        case 'import': {

            const cwd = options.cwd;

            const src = extraArgs[3];
            const keyType = extraArgs[4];

            if (!src) {
                throw new DisplayError(colors.red('Must specify source path as first argument'));
            }

            if (!keyType) {
                throw new DisplayError(colors.red('Must specify key type as second argument'));
            }

            const srcFile = src ? Path.resolve(cwd, src) : src;

            const { output: importOutput } = await Doggo.api.importKey(srcFile, keyType);

            ctx.output('output: ' + importOutput);
            break;
        }
        case 'delete': {

            const keyIdentifier = extraArgs[3];
            const keyType = extraArgs[4];

            if (!keyIdentifier) {
                throw new DisplayError(colors.red('Must specify key identifier as first argument'));
            }

            if (!keyType) {
                throw new DisplayError(colors.red('Must specify key type as second argument'));
            }

            const { output: deleteOutput } = await Doggo.api.deleteKeys(keyIdentifier, keyType);

            ctx.output(deleteOutput);
            break;
        }
        case 'gen-password': {

            ctx.output(Doggo.api.genPassword());
            break;
        }
        default: {
            throw new DisplayError(`${internals.usage(ctx)}\n\n` + colors.red(`Unknown command: ${commandAndPart}`));
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

// eslint-disable-next-line hapi/hapi-scope-start
internals.usageText = (ctx) => `doggo <command> [options]
Commands:
  ${ctx.colors.green('doggo gen')} <key-identifier>
    ${ctx.colors.yellow('e.g.')} doggo gen doggo-user1
  ${ctx.colors.green('doggo list')} [key-identifier] [key-type]
    ${ctx.colors.yellow('e.g.')} doggo list doggo-user1 sec
  ${ctx.colors.green('doggo encrypt')} <source-path|text> [output-filepath]
    ${ctx.colors.yellow('e.g.')} doggo encrypt ./test.txt tst.encrypted
  ${ctx.colors.green('doggo decrypt')} <source-path|text> [output-filepath]
    ${ctx.colors.yellow('e.g.')} doggo decrypt ./test.encrypted ./test.decrypted
  ${ctx.colors.green('doggo export')} <key-identifier|text> <key-type> [dest-file]
    ${ctx.colors.yellow('e.g.')} doggo export doggo-user1
  ${ctx.colors.green('doggo import')} <source-path> <key-type>
    ${ctx.colors.yellow('e.g.')} doggo import ./test.pub pub
  ${ctx.colors.green('doggo delete')} <key-identifier> <key-type>
    ${ctx.colors.yellow('e.g.')} doggo delete doggo-user1 all
`;
