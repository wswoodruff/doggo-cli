'use strict';

const Util = require('util');
const Fs = require('fs');
const Os = require('os');

const Joi = require('joi');
const Bourne = require('bourne');
const Bounce = require('bounce');
const Wreck = require('wreck');

const { GPG_ERRORS, ...DoggoAdapterGpg } = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Helpers = require('./helpers');

const internals = {};

const LOCAL_CREDS_PATH = (fingerprint) => `${Os.homedir()}/doggo/doggo-dish-creds-${fingerprint}.gpg`;

exports.login = (...args) => {

    return internals.login(...args);
};

exports.logout = () => {};

exports.syncRemote = async (remotePath, user, password) => {

    const { fingerprint } = await internals.getUserPubKeyInfo(user);

    let { output, err } = await Doggo.api.decrypt(LOCAL_CREDS_PATH(fingerprint));

    if (output && (output.toLowerCase().includes(GPG_ERRORS.NOT_FOUND) ||
        output.toLowerCase().includes(GPG_ERRORS.NO_GPG_DATA))) {
        output = undefined;
    }

    if (err && typeof err === 'string' && !err.toLowerCase().includes(GPG_ERRORS.NOT_FOUND)) {
        return [err];
    }

    let remotes = {};

    if (output) {
        remotes = Bourne.parse(output);
    }

    let jwt;

    if (!remotes[remotePath] || !remotes[remotePath].jwt) {

        const hasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

        password = password || await internals.ensurePassword(password);

        if (!hasAccount) {
            const [createErr, createOutput] = await internals.createUser(remotePath, fingerprint, password);

            if (createErr) {
                return [createErr];
            }
        }

        const [loginErr, loginJwt] = await internals.login(remotePath, fingerprint, password);

        if (loginErr) {
            return [loginErr];
        }

        jwt = loginJwt;

        await internals.saveJwt(user, remotePath, remotes, jwt);
    }
    else {
        jwt = remotes[remotePath].jwt;

        const { error: getUserErr } = await internals.getLoggedIn(remotePath, jwt);

        if (getUserErr) {
            password = password || await internals.ensurePassword(password);

            const [newJwtErr, tryNewJwt] = await internals.login(remotePath, fingerprint, password);

            jwt = tryNewJwt;

            if (newJwtErr && newJwtErr.toLowerCase().includes('unauthorized')) {
                const newJwtHasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

                if (newJwtHasAccount) {
                    return [new Error('Try a different password')];
                }
                else {
                    const createAndLogin = async (attemptRemotePath, attemptFingerprint, attemptPassword) => {

                        const [attemptCreateErr, attemptCreateOutput] = await internals.createUser(attemptRemotePath, attemptFingerprint, attemptPassword);

                        if (attemptCreateErr) {
                            return [attemptCreateErr];
                        }

                        const [attemptCreateLoginErr, attemptCreateLoginJwt] = await internals.login(attemptRemotePath, attemptFingerprint, attemptPassword);

                        if (attemptCreateLoginErr) {
                            return [attemptCreateLoginErr];
                        }

                        return [null, attemptCreateLoginJwt];
                    };

                    const [createAndLoginErr, createAndLoginJwt] = await createAndLogin(remotePath, fingerprint, password);

                    if (createAndLoginErr) {
                        return [createAndLoginErr];
                    }

                    jwt = createAndLoginJwt;
                }
            }
            else if (newJwtErr) {
                return [newJwtErr];
            }

            await internals.saveJwt(user, remotePath, remotes, jwt);
        }
    }

    return [null, jwt];
};

exports.listRemotes = async (fingerprint) => {

    let { output, err } = await Doggo.api.decrypt(LOCAL_CREDS_PATH(fingerprint));

    if (output && (output.toLowerCase().includes(GPG_ERRORS.NOT_FOUND) ||
        output.toLowerCase().includes(GPG_ERRORS.NO_GPG_DATA))) {
        output = undefined;
    }

    if (err) {
        Bounce.ignore(err, {
            message: GPG_ERRORS.NOT_FOUND
        });
    }

    if (output) {
        output = Bourne.parse(output);
    }

    return output ? [err, Object.keys(output)] : [err];
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

    if (err) {
        return [err];
    }

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
        return [null, '\nCreated user on doggo-dish server'];
    }

    return [res.error];
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
    const { results, error } = Bourne.parse(res.toString('utf8'));

    return [error, results];
};

internals.getUserPubKeyInfo = async (user) => {

    const { output: [pubKeyInfo] } = await Doggo.api.listKeys(user, 'pub');
    return pubKeyInfo;
};

internals.saveJwt = async (user, remotePath, remotes, jwt) => {

    const { fingerprint } = await internals.getUserPubKeyInfo(user);

    remotes = {
        ...remotes,
        [remotePath]: {
            ...remotes[remotePath],
            jwt
        }
    };

    await Doggo.api.encrypt(user, JSON.stringify(remotes), LOCAL_CREDS_PATH(fingerprint));
};

internals.getLoggedIn = async (remotePath, jwt) => {

    let res = await Wreck.request('get', '/user', {
        baseUrl: remotePath,
        headers: { authorization: jwt }
    });

    res = await Wreck.read(res);

    return Bourne.parse(res.toString('utf8'));
};
