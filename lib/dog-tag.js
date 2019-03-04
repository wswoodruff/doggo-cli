'use strict';

const Util = require('util');
const Fs = require('fs');

const Joi = require('joi');
const Automerge = require('automerge');
const Uuid = require('uuid');
const Enquirer = require('enquirer');
const Fuse = require('fuse.js');
const DoggoPackage = require('doggo/package.json');

const Mkdirp = require('mkdirp');

// TODO Need to have a mini version of package-lock where we define the version
// numbers of each module used (doggo, doggo-cli, doggo-adapter-gpg, ...etc)

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Helpers = require('./helpers');

const internals = {};

exports.list = async (secretPath, keyIdentifier, search) => {

    const instance = await internals.getInstance(secretPath, keyIdentifier);

    let output = instance.secrets;

    if (search) {
        output = internals.search(output, search, { keys: ['tags'] });
    }

    return { output };
};

exports.add = async (secretPath, keyIdentifier) => {

    Helpers.assert([secretPath, keyIdentifier], '"secretPath, keyIdentifier" are required to add secret');

    const instance = await internals.getInstance(secretPath, keyIdentifier);

    let tags = await Helpers.prompt('Enter tags to find this secret later');
    const secret = await Helpers.prompt('Enter secret');

    tags = internals.getTagsFromString(tags);

    // IMPORTANT NOTE: Only use single quotes on Automerge messages, using double quotes breaks Automerge.load later /shrug
    const updatedTag = Automerge.change(instance, `Add '${internals.slugifyTags(tags)}'`, (draft) => {

        draft.secrets.push({ tags, secret, id: Uuid.v4() });
        draft.version = Automerge.getHistory(instance).length + 1;
        draft.doggoVersion = DoggoPackage.version;
    });

    await exports.save(secretPath, keyIdentifier, updatedTag);

    return { output: updatedTag };
};

exports.delete = async (secretPath, keyIdentifier, search) => {

    Helpers.assert([secretPath, keyIdentifier, search], '"secretPath, keyIdentifier, search" are required to delete secret');

    const instance = await internals.getInstance(secretPath, keyIdentifier);

    const toDelete = await internals.getSingleFromList(instance.secrets, search || '', { keys: ['tags'] });

    if (!toDelete) {
        return { output: 'No result found for search' };
    }

    const { areYouSure } = await Enquirer.prompt({
        type: 'confirm',
        name: 'areYouSure',
        message: `Are you sure you want to delete secret "${internals.slugifyTags(toDelete.tags)}"?`
    });

    if (!areYouSure) {
        return { output: 'Delete cancelled' };
    }

    const { areYouReallySure } = await Enquirer.prompt({
        type: 'confirm',
        name: 'areYouReallySure',
        message: `Are you REALLY sure you want to delete secret "${internals.slugifyTags(toDelete.tags)}"?`
    });

    if (!areYouReallySure) {
        return { output: 'Delete cancelled' };
    }

    // IMPORTANT NOTE: Only use single quotes on Automerge messages, using double quotes breaks Automerge.load later /shrug
    const updatedTag = Automerge.change(instance, `Delete '${internals.slugifyTags(toDelete.tags)}'`, (draft) => {

        draft.secrets.splice(draft.secrets.findIndex((item) => item.id === toDelete.id), 1);
        draft.version = Automerge.getHistory(instance).length + 1;
        draft.doggoVersion = DoggoPackage.version;
    });

    await exports.save(secretPath, keyIdentifier, updatedTag);
    return { output: `Successfully deleted '${internals.slugifyTags(toDelete.tags)}'` };
};

exports.update = async (secretPath, keyIdentifier, search) => {

    Helpers.assert([secretPath, keyIdentifier], '"secretPath, keyIdentifier" are required to update secret');

    const instance = await internals.getInstance(secretPath, keyIdentifier);

    const toUpdate = await internals.getSingleFromList(instance.secrets, search || '', { keys: ['tags'] });

    if (!toUpdate) {
        return { output: 'No result found for search' };
    }

    const choices = Object.entries(toUpdate)
        .filter(([key]) => key !== 'id' && key !== 'isDoggo') // Don't allow the user to edit 'id' or 'isDoggo'
        .map(([key, value]) => ({ name: key, initial: key !== 'tags' ? value : internals.slugifyTags(value) }));

    const { edited } = await Enquirer.prompt({
        type: 'form',
        name: 'edited',
        message: `Editing '${toUpdate.tags}'`,
        choices
    });

    edited.tags = internals.getTagsFromString(edited.tags);

    // IMPORTANT NOTE: Only use single quotes on Automerge messages, using double quotes breaks Automerge.load later /shrug
    const updatedTag = Automerge.change(instance, `Update '${internals.slugifyTags(toUpdate.tags)}'`, (draft) => {

        draft.secrets.splice(draft.secrets.findIndex((item) => item.id === toUpdate.id), 1, Object.assign({}, toUpdate, edited));
        draft.version = Automerge.getHistory(instance).length + 1;
        draft.doggoVersion = DoggoPackage.version;
    });

    await exports.save(secretPath, keyIdentifier, updatedTag);
    return { output: `Successfully updated '${internals.slugifyTags(edited.tags)}'` };
};

exports.save = async (savePath, keyIdentifier, instance) => {

    if (!keyIdentifier || !instance) {
        throw new Error('"keyIdentifier, instance" are required to save');
    }

    const toSave = Automerge.save(instance).replace(/\r?\n|\r/, ' ');

    const { output, err } = await Doggo.api.encrypt(keyIdentifier, toSave);

    if (err) {
        throw err;
    }

    await Util.promisify(Fs.writeFile)(savePath, output);
};

internals.stateSchema = Joi.object({
    version: Joi.number(),
    secrets: Joi.array()
});

internals.getInstance = async (secretPath, keyIdentifier) => {

    let instance;

    if (!secretPath || typeof secretPath !== 'string') {
        throw new Error('Must pass "secretPath" as 1st arg to "getInstance"');
    }

    // Ensure intermediate directories for secretPath
    await Util.promisify(Mkdirp)(secretPath.split('/').slice(0, -1).join('/'));

    const { output, err } = await Doggo.api.decrypt(secretPath);

    if (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }

        instance = Automerge.init();

        // IMPORTANT NOTE: Only use single quotes on Automerge messages, using double quotes breaks Automerge.load later /shrug
        instance = Automerge.change(instance, 'Initialize', (draft) => {

            // Special property to denote that doggo created it
            draft.isDoggo = true;
            draft.id = Uuid.v4();
            draft.version = 1;
            draft.secrets = [];
            draft.doggoVersion = DoggoPackage.version;
        });

        await exports.save(secretPath, keyIdentifier, instance);
    }
    else {
        instance = await Automerge.load(output);
    }

    return instance;
};

internals.getSingleFromList = async (list, search, options = {}) => {

    const results = await internals.search(list, search, options);

    let result = results[0];

    if (results.length > 1) {

        const joinedTags = results.map((r) => internals.slugifyTags(r.tags));

        const { chosenResult } = await Enquirer.prompt([{
            type: 'select',
            name: 'chosenResult',
            message: 'Choose from the list',
            choices: joinedTags
        }]);

        result = list.find((item) => chosenResult === internals.slugifyTags(item.tags));
    }

    return result;
};

internals.search = (list, search, options = {}) => {

    let res = new Fuse(list, options).search(search);

    // If the results are all numbers, an array of strings was passed as 'list'
    if (res.map((item) => parseInt(item)).filter((item) => !isNaN(item)).length === res.length) {
        res = res.map((index) => list[index]);
    }

    // If options.id is defined, Fuse will send back the id of the match
    if (options && options.keys && options.id) {
        res = list.filter((item) => res.includes(item.id));
    }

    return res;
};

internals.slugifyTags = (tags) => tags.join(', ');

internals.getTagsFromString = (str) => str.split(/[\s,]+/g);

process.on('uncaughtException', (err) => {

    console.log('UNCAUGHT', err);
});
