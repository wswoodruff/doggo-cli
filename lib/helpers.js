'use strict';

const Util = require('util');
const Fs = require('fs');

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

exports.getUser = async (args) => {

    let user = args && (args.u || args.user);

    while (!user) {
        const { inputUser } = await Enquirer.prompt([{
            type: 'input',
            name: 'inputUser',
            message: 'Enter user/key-identifier'
        }]);

        user = inputUser;
    }

    return user;
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
