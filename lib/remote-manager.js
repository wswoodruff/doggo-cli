'use strict';

const Util = require('util');
const Fs = require('fs');
const Os = require('os');

const Wreck = require('wreck');

const DoggoAdapterGpg = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Helpers = require('./helpers');

const internals = {};

const LOCAL_CREDS_PATH = `${Os.homedir()}/doggo/doggo-dish-creds.gpg`;

exports.login = (...args) => {

    return internals.login(...args);
};

exports.logout = () => {


};

exports.getJwt = async (remotePath, user, password) => {

    const { output, err } = await Doggo.api.decrypt(LOCAL_CREDS_PATH);

    const { fingerprint } = await internals.getUserPubKeyInfo(user);

    let remotes = {};

    let jwt;

    if (err && err.message && err.message.includes('No such file or directory')) {

        password = await internals.ensurePassword(password);

        const hasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

        if (!hasAccount) {
            await internals.createUser(remotePath, fingerprint, password);
        }

        jwt = await internals.login(remotePath, fingerprint, password);
        await internals.saveJwt(user, remotePath, remotes, jwt);

        return jwt;
    }

    remotes = JSON.parse(output);
    if (!remotes[remotePath] || !remotes[remotePath].jwt) {
        password = await internals.ensurePassword(password);

        jwt = await internals.login(remotePath, fingerprint, password);
        await internals.saveJwt(user, remotePath, remotes, jwt);
    }
    else {
        jwt = remotes[remotePath].jwt;
        // TODO ensure jwt is still valid
    }

    return jwt;
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
    res = JSON.parse(res.toString('utf8'));

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
    return JSON.parse(res.toString('utf8')).results;
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
