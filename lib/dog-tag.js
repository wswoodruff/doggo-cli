'use strict';

const Util = require('util');
const Joi = require('joi');
const Fs = require('fs');
const Automerge = require('automerge');
const Uuid = require('uuid');
const Inquirer = require('inquirer');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const LOCAL_TAG_FILE_PATH = `${__dirname}/local-tag.gpg`;

const internals = {};

exports.list = async (instance, keyIdentifier, search) => {

    instance = instance || await internals.getInstance(keyIdentifier);
    return { output: instance.secrets };
};

exports.add = async (instance, keyIdentifier) => {

    instance = instance || await internals.getInstance(keyIdentifier);
    const { keywords } = await Inquirer.prompt([{
        type: 'input',
        name: 'keywords',
        message: 'Enter keywords to find this secret later'
    }]);

    const { secret } = await Inquirer.prompt([{
        type: 'password',
        name: 'secret',
        message: 'Enter secret'
    }]);

    const updatedTag = Automerge.change(instance, 'Add ' + keywords, (draft) => {

        draft.secrets.push({ keywords, secret });
    });

    await exports.save(keyIdentifier, updatedTag);

    return { output: updatedTag };
};

exports.save = async (keyIdentifier, instance) => {

    if (!keyIdentifier || !instance) {
        throw new Error('keyIdentifier and instance are required to save');
    }

    const str = Automerge.save(instance);

    const { output, err: encryptErr } = await Doggo.api.encrypt(keyIdentifier, str);

    if (encryptErr) {
        throw encryptErr;
    }

    await Util.promisify(Fs.writeFile)(LOCAL_TAG_FILE_PATH, output);
};

internals.stateSchema = Joi.object({
    version: Joi.number(),
    secrets: Joi.array()
});

internals.getInstance = async (keyIdentifier) => {

    if (!keyIdentifier) {
        throw new Error('keyIdentifier is required');
    }

    let instance;

    try {
        instance = await Util.promisify(Fs.readFile)(LOCAL_TAG_FILE_PATH);
        const { output, err } = await Doggo.api.decrypt(LOCAL_TAG_FILE_PATH);

        instance = output;
        instance = await Automerge.load(instance);
    }
    catch (err) {

        if (err.code !== 'ENOENT') {
            throw err;
        }

        instance = Automerge.init();

        instance = Automerge.change(instance, 'Initialize', (draft) => {

            draft.id = Uuid.v4();
            draft.version = 1;
            draft.secrets = [];
        });

        await exports.save(keyIdentifier, instance);
    }

    return instance;
};

internals.isInstance = (maybeInstance) => maybeInstance.isDogtag;

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
