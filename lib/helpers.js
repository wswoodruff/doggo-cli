'use strict';

const Fs = require('fs').promises;

const Bounce = require('bounce');
const { GPG_ERRORS, ...DoggoAdapterGpg } = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Enquirer = require('enquirer');

const FILE_NAME_LENGTH_LIMIT = 200;

const internals = {};

exports.assert = (bool, err) => {

    if (![].concat(bool).every((b) => !!b)) {
        if (err instanceof Error) {
            throw err;
        }

        throw new Error(String(err));
    }
};

exports.ensureArgs = async (args = {}) => {

    const argsClone = { ...args };

    const keys = Object.keys(args);

    for (let i = 0; i < keys.length; ++i) {
        const key = keys[i];
        argsClone[key] = args[key] || await exports.prompt(`Enter ${key}`);
    }

    return argsClone;
};

exports.prompt = async (msg, type, choices) => {

    let input;

    while (!input && input !== false) {
        ({ input } = await Enquirer.prompt([{
            type: type || 'input',
            name: 'input',
            message: msg,
            choices
        }]));
    }

    return input;
};

// Awful implementation of checking if a file exists. Copied from doggo-adapter-gpg
// TODO fix this mess
exports.fileExists = async (path) => {

    const toThrow = new Error(`File "${path}" does not exist`);

    if (!path) {
        throw toThrow;
    }

    let srcIsFile = false;

    try {
        if (path.length <= FILE_NAME_LENGTH_LIMIT) {
            await Fs.readFile(path, { encoding: 'utf8' });

            return true;
        }
    }
    catch (err) {
        Bounce.ignore(err, { code: 'ENOENT' });

        return false;
    }
};

exports.pickUser = async (keyIdentifier, keyType = 'sec', msg = 'Please choose key') => {

    const keyMatches = await exports.withErrHandling(Doggo.api.listKeys, keyIdentifier, keyType);

    if (keyMatches.length === 0) {
        throw new Error(`No user found for "${keyIdentifier}"`);
    }
    else if (keyMatches.length === 1) {
        if (!await exports.prompt(`Use key "${keyMatches[0].id}"?`, 'confirm')) {
            throw new Error('Must choose a key to continue');
        }

        return keyMatches[0];
    }

    const chosenKey = await exports.prompt(msg, 'select', keyMatches.map(({ id }) => id));
    return keyMatches.find(({ id }) => id === chosenKey);
};

exports.readFileAndDecryptIfNeeded = async (pathOrString) => {

    let contents = pathOrString;

    if (await exports.fileExists(pathOrString)) {
        contents = await Fs.readFile(pathOrString, { encoding: 'utf8' });
    }

    // Try decrypting, if there's no gpg data found that's fine
    const { output: decryptOutput, err: decryptErr } = await Doggo.api.decrypt(contents);

    // Ignore no gpg data
    if (decryptErr) {
        if (!decryptErr.message.includes(GPG_ERRORS.NO_GPG_DATA)) {
            throw decryptErr;
        }
    }
    else {
        contents = decryptOutput;
    }

    return contents;
};

exports.withErrHandling = async (func, ...args) => {

    let { output, err } = await func(...args);

    if (err) {
        throw err;
    }

    return output;
};
