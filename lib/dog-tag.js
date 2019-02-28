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

const Helpers = require('./helpers');

const LOCAL_TAG_FILE_PATH = `${__dirname}/local-tag.gpg`;

const internals = {};

exports.list = async (keyIdentifier, search, instance) => {

    instance = instance || await internals.getInstance(keyIdentifier);

    let output = instance.secrets;

    if (search) {
        output = internals.search(output, search, { keys: ['tags'] });
    }

    return { output };
};

exports.add = async (keyIdentifier, instance) => {

    instance = instance || await internals.getInstance(keyIdentifier);

    let tags = await Helpers.prompt('Enter tags to find this secret later');
    const secret = await Helpers.prompt('Enter secret');

    tags = tags.split(/[\s,]+/g);

    const updatedTag = Automerge.change(instance, `Add "${tags.join(', ')}"`, (draft) => {

        draft.secrets.push({ tags, secret, id: Uuid.v4() });
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, updatedTag);

    return { output: updatedTag };
};

exports.delete = async (keyIdentifier, search, instance) => {

    Helpers.assert([keyIdentifier, search], '"keyIdentifier, search" required to delete secret');

    instance = instance || await internals.getInstance(keyIdentifier);

    const toDelete = await internals.getSingleFromList(instance.secrets, search || '', { keys: ['tags'] });

    if (!toDelete || toDelete.length === 0) {
        return { output: 'No result found for search' };
    }

    const { areYouSure } = await Enquirer.prompt({
        type: 'confirm',
        name: 'areYouSure',
        message: `Are you sure you want to delete secret "${toDelete.tags.join(', ')}"?`
    });

    const { areYouSureSure } = await Enquirer.prompt({
        type: 'confirm',
        name: 'areYouSureSure',
        message: `Are you REALLY sure you want to delete secret "${toDelete.tags.join(', ')}"?`
    });

    if (!areYouSure || !areYouSureSure) {
        return { output: 'Delete cancelled' };
    }

    const updatedTag = Automerge.change(instance, `Delete "${toDelete.tags.join(', ')}"`, (draft) => {

        draft.secrets.splice(draft.secrets.findIndex((item) => item.id === toDelete.id), 1);
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, updatedTag);
    return { output: `Successfully deleted '${toDelete.tags.join(', ')}'` };
};

exports.update = async (keyIdentifier, search, instance) => {

    instance = instance || await internals.getInstance(keyIdentifier);

    const { index, ...toUpdate } = await exports.search(instance, keyIdentifier, search) || {};

    if (!toUpdate || Object.keys(toUpdate).length === 0) {
        return { output: 'No result found for search' };
    }

    const choices = Object.keys(toUpdate).map((key) => ({ name: key, initial: toUpdate[key] }));

    const { edited } = await Enquirer.prompt({
        type: 'form',
        name: 'edited',
        message: `Editing "${toUpdate.tags}"`,
        choices
    });

    console.log('edited', edited);

    const newInstance = Automerge.change(instance, `Update "${toUpdate.tags.join(', ')}"`, (draft) => {

        draft.secrets.splice(index, 1, Object.assign({}, toUpdate, edited));
        draft.version = Automerge.getHistory(instance).length + 1;
    });

    await exports.save(keyIdentifier, newInstance);
    return { output: `Successfully updated "${toUpdate.tags}"` };
};

exports.search = async (keyIdentifier, search, instance) => {

    if (!search || !instance) {
        throw new Error('Must pass instance and search value to search func');
    }

    let { output: list } = await exports.list(keyIdentifier, search, instance);
    list = list.map((item, index) => Object.assign({ index }, item));

    const searchList = list.map((item) => item.tags);
    const selected = await internals.getSingleFromList(searchList, search);

    const resultIndex = list.findIndex((item) => item.tags === selected);

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

    let instance;

    try {
        instance = await Util.promisify(Fs.readFile)(LOCAL_TAG_FILE_PATH);
        const { output, err } = await Doggo.api.decrypt(LOCAL_TAG_FILE_PATH);

        instance = await Automerge.load(output);
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

internals.getSingleFromList = async (list, search, options) => {

    const results = await internals.search(list, search, options);

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

internals.search = (list, search, options) => {

    let res = new Fuse(list, options).search(search);

    // If the results are all numbers, an array of strings was passed as 'list'
    if (res.map((item) => parseInt(item)).filter((item) => !isNaN(item)).length === res.length) {
        res = res.map((index) => list[index]);
    }

    if (options && options.keys && options.id) {
        res = list.filter((item) => res.includes(item.id));
    }

    return res;
};

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
