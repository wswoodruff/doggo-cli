'use strict';

const Enquirer = require('enquirer');

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

exports.prompt = async (msg, type) => {

    let input;

    while (!input && input !== false) {
        ({ input } = await Enquirer.prompt([{
            type: type || 'input',
            name: 'input',
            message: msg
        }]));
    }

    return input;
};
