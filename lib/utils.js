'use strict';

const Enquirer = require('enquirer');

const internals = {};

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
        let val = args[key];

        const message = internals.args[key] ? internals.args[key].message : `Enter ${key}`;

        if (!val) {
            const { input } = await Enquirer.prompt([{
                type: 'input',
                name: 'input',
                message
            }]);

            val = input;
        }

        argsClone[key] = val;
    }

    return argsClone;
};

internals.args = {
    user: {
        message: 'Enter user/key-identifier'
    }
};
