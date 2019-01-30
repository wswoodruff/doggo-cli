'use strict';

const Util = require('util');
const Fs = require('fs');

const Joi = require('joi');
const Automerge = require('automerge');
const Uuid = require('uuid');
const Enquirer = require('enquirer');
const Fuse = require('fuse.js');

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

    let keywords = '';

    while (!keywords) {
        const keywordsOutput = await Enquirer.prompt([{
            type: 'input',
            name: 'keywords',
            message: 'Enter keywords to find this secret later'
        }]);

        keywords = keywordsOutput.keywords;

        if (!keywords) {
            console.log('\nMust enter value for "keywords"\n');
        }
    }

    let secret = '';

    while (!secret) {
        const secretOutput = await Enquirer.prompt([{
            type: 'password',
            name: 'secret',
            message: 'Enter secret'
        }]);

        secret = secretOutput.secret;

        if (!secret) {
            console.log('\nMust enter value for "secret"\n');
        }
    }

    const updatedTag = Automerge.change(instance, 'Add ' + keywords, (draft) => {

        draft.secrets.push({ keywords, secret });
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, updatedTag);

    return { output: updatedTag };
};

exports.delete = async (instance, keyIdentifier, search) => {

    instance = instance || await internals.getInstance(keyIdentifier);

    const toDelete = await exports.search(instance, keyIdentifier, search);

    if (!toDelete) {
        return { output: 'No result found for search' };
    }

    const { areYouSure } = await Enquirer.prompt({
        type: 'confirm',
        name: 'areYouSure',
        message: `Are you sure you want to delete secret "${toDelete.keywords}"?`
    });

    if (!areYouSure) {
        return { output: 'Delete cancelled' };
    }

    const newInstance = Automerge.change(instance, `Delete "${toDelete.keywords}"`, (draft) => {

        draft.secrets.splice(toDelete.index, 1);
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, newInstance);
    return { output: `Successfully deleted "${toDelete.keywords}"` };
};

exports.update = async (instance, keyIdentifier, search) => {

    instance = instance || await internals.getInstance(keyIdentifier);

    const { index, ...toUpdate } = await exports.search(instance, keyIdentifier, search) || {};

    if (!toUpdate || Object.keys(toUpdate).length === 0) {
        return { output: 'No result found for search' };
    }

    const choices = Object.keys(toUpdate).map((key) => ({ name: key, initial: toUpdate[key] }));

    const { edited } = await Enquirer.prompt({
        type: 'form',
        name: 'edited',
        message: `Editing "${toUpdate.keywords}"`,
        choices
    });

    console.log('edited', edited);

    const newInstance = Automerge.change(instance, `Update "${toUpdate.keywords}"`, (draft) => {

        draft.secrets.splice(index, 1, Object.assign({}, toUpdate, edited));
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, newInstance);
    return { output: `Successfully updated "${toUpdate.keywords}"` };
};

exports.search = async (instance, keyIdentifier, search) => {

    if (!instance || !search) {
        throw new Error('Must pass instance and search value to search func');
    }

    let { output: list } = await exports.list(instance, keyIdentifier);
    list = list.map((item, index) => Object.assign({ index }, item));

    const searchList = list.map((item) => item.keywords);
    const selected = await internals.getSingleFromList(searchList, search);

    const resultIndex = list.findIndex((item) => item.keywords === selected);

    if (resultIndex < 0) {
        return null;
    }

    return list[resultIndex];
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

internals.getSingleFromList = async (list, search) => {

    const indices = new Fuse(list, { keys: ['keywords'] }).search(search);
    const results = indices.map((index) => list[index]);

    let result = results[0];

    if (results.length > 1) {

        const { chosenResult } = await Enquirer.prompt([{
            type: 'select',
            name: 'chosenResult',
            message: 'Choose from the list',
            choices: results
        }]);

        result = chosenResult;
    }

    return result;
};

internals.isInstance = (maybeInstance) => maybeInstance.isDogtag;

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
