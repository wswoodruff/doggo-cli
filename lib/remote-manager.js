'use strict';

const Util = require('util');
const Fs = require('fs');
const Os = require('os');

const Joi = require('joi');
const Bourne = require('bourne');
const Bounce = require('bounce');
const Wreck = require('wreck');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Helpers = require('./helpers');

const internals = {};

const LOCAL_CREDS_PATH = `${Os.homedir()}/doggo/doggo-dish-creds.gpg`;

const GPG_ERRORS = {
    NOT_FOUND: 'No such file or directory'
};

exports.login = (...args) => {

    return internals.login(...args);
};

exports.logout = () => {};

exports.syncRemote = async (remotePath, user, password) => {

    let { output, err } = await Doggo.api.decrypt(LOCAL_CREDS_PATH);

    if (output.includes(GPG_ERRORS.NOT_FOUND)) {
        output = undefined;
    }

    if (err && typeof err === 'string' && !err.includes(GPG_ERRORS.NOT_FOUND)) {
        throw err;
    }

    const { fingerprint } = await internals.getUserPubKeyInfo(user);

    let remotes = {};

    if (output) {
        remotes = Bourne.parse(output);
    }

    let jwt;

    if (!remotes[remotePath]) {

        password = await internals.ensurePassword(password);

        const hasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

        if (!hasAccount) {
            await internals.createUser(remotePath, fingerprint, password);
        }
    }

    if (!remotes[remotePath] || !remotes[remotePath].jwt) {
        password = password || await internals.ensurePassword(password);

        jwt = await internals.login(remotePath, fingerprint, password);
        await internals.saveJwt(user, remotePath, remotes, jwt);
    }
    else {
        jwt = remotes[remotePath].jwt;
        // TODO ensure jwt is still valid
    }

    return jwt;
};

exports.listRemotes = async () => {

    let { output, err } = await Doggo.api.decrypt(LOCAL_CREDS_PATH);

    if (output.includes(GPG_ERRORS.NOT_FOUND)) {
        output = undefined;
    }

    if (err && typeof err === 'string' && !err.includes(GPG_ERRORS.NOT_FOUND)) {
        throw err;
    }

    if (output) {
        output = Bourne.parse(output);
    }

    return output ? Object.keys(output) : [];
};

exports.addSecret = async (jwt, remote, payload) => {

    let res = await Wreck.request('post', `/secrets`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });

    res = await Wreck.read(res);
    return Bourne.parse(res.toString('utf8'));
};

exports.updateSecret = async (jwt, remote, { name, ...payload }) => {

    let res = await Wreck.request('post', `/secrets/${name}`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });

    res = await Wreck.read(res);
    return Bourne.parse(res.toString('utf8'));
};

exports.getSecret = async (jwt, remote, secretName) => {

    let res = await Wreck.request('get', `/secrets/${secretName}`, {
        baseUrl: remote,
        headers: { authorization: jwt }
    });

    res = await Wreck.read(res);
    return res.toString('utf8');
};

exports.listSecrets = async (jwt, remote) => {

    let res = await Wreck.request('get', `/secrets/list`, {
        baseUrl: remote,
        headers: { authorization: jwt }
    });

    res = await Wreck.read(res);
    return Bourne.parse(res.toString('utf8'));
};

internals.ensurePassword = async (password) => {

    password = password || await Helpers.prompt('Enter remote password', 'password');
    return password;
};

internals.createUser = async (remotePath, fingerprint, password) => {

    const { output: pubKey, err } = await Doggo.api.exportKey(fingerprint, 'pub');

    let res = await Wreck.request('post', '/users/create', {
        baseUrl: remotePath,
        payload: {
            fingerprint: fingerprint,
            publicKey: pubKey,
            password
        }
    });

    res = await Wreck.read(res);
    res = Bourne.parse(res.toString('utf8'));

    if (res.results && res.results === 'Success') {
        return console.log('\nCreated user on doggo-dish server');
    }

    throw new Error(res);
};

internals.login = async (remotePath, fingerprint, password) => {

    let res = await Wreck.request('post', '/login', {
        baseUrl: remotePath,
        payload: {
            fingerprint,
            password
        }
    });

    res = await Wreck.read(res);
    // 'results' is a jwt
    return Bourne.parse(res.toString('utf8')).results;
};

internals.getUserPubKeyInfo = async (user) => {

    const { output: [pubKeyInfo] } = await Doggo.api.listKeys(user, 'pub');
    return pubKeyInfo;
};

internals.saveJwt = async (user, remotePath, remotes, jwt) => {

    remotes = {
        ...remotes,
        [remotePath]: {
            ...remotes[remotePath],
            jwt
        }
    };

    await Doggo.api.encrypt(user, JSON.stringify(remotes), LOCAL_CREDS_PATH);
};
