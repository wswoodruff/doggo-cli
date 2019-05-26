'use strict';

const Util = require('util');
const Fs = require('fs');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
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
exports.fileExists = async (path, shouldThrow) => {

    const toThrow = new Error(`File "${path}" does not exist`);

    if (!path) {
        if (shouldThrow) {
            throw toThrow;
        }
        return false;
    }

    let srcIsFile = false;

    try {
        if (path.length <= FILE_NAME_LENGTH_LIMIT) {
            await Util.promisify(Fs.readFile)(path);
            srcIsFile = true;
        }
    }
    catch (err) {
        if (shouldThrow || err.code !== 'ENOENT') {
            throw err;
        }
    }

    if (!srcIsFile && shouldThrow) {
        throw toThrow;
    }

    return srcIsFile;
};

exports.pickUser = async (keyIdentifier, keyType = 'sec', msg = 'Please choose key') => {

    const { output: keyMatches, err } = await Doggo.api.listKeys(keyIdentifier, keyType);

    if (err) {
        throw err;
    }

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
