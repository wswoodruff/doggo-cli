'use strict';

const Bourne = require('bourne');
const Wreck = require('wreck');

const { GPG_ERRORS, ...DoggoAdapterGpg } = require('doggo-adapter-gpg')({});
const Doggo = require('doggo')(DoggoAdapterGpg, {});

const Helpers = require('./helpers');

const internals = {};

const { LOCAL_REMOTES_PATH } = require('./constants');

exports.login = (...args) => {

    return internals.login(...args);
};

exports.logout = () => {};

exports.addRemote = async (remoteUrl, { fingerprint }, password) => {


};

exports.syncRemote = async (remotePath, { fingerprint, pubKey }, password) => {

    const output = await Helpers.withDoggoErrHandling(Doggo.api.decrypt, LOCAL_REMOTES_PATH(fingerprint));

    const remotes = Bourne.parse(output);

    let jwt;

    if (!remotes[remotePath] || !remotes[remotePath].jwt) {

        const hasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

        password = password || await internals.ensurePassword(password);

        if (!hasAccount) {
            const [createErr] = await internals.createUser(remotePath, { pubKey }, password);

            if (createErr) {
                return [createErr];
            }
        }

        const [loginErr, loginJwt] = await internals.login(remotePath, fingerprint, password);

        if (loginErr) {
            return [loginErr];
        }

        jwt = loginJwt;

        // await internals.saveJwt({ user, remotePath, remotes, jwt });
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

                const createAndLogin = async (attemptRemotePath, attemptFingerprint, attemptPassword) => {

                    const [attemptCreateErr] = await internals.createUser(attemptRemotePath, attemptFingerprint, attemptPassword);

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
            else if (newJwtErr) {
                return [newJwtErr];
            }

            // await internals.saveJwt({ user, remotePath, remotes, jwt });
        }
    }

    return [null, jwt];
};

exports.listRemotes = async (fingerprint) => {

    let { output, err } = await Doggo.api.decrypt(LOCAL_REMOTES_PATH(fingerprint));

    if (output && (output.toLowerCase().includes(GPG_ERRORS.NOT_FOUND) ||
        output.toLowerCase().includes(GPG_ERRORS.NO_GPG_DATA))) {
        output = undefined;
    }

    return [err, output ? Object.keys(Bourne.parse(output)) : output];
};

exports.addSecret = async (jwt, remote, payload) => {

    return await internals.fetchFromWreck('post', `/secrets`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });
};

exports.updateSecret = async (jwt, remote, { name, ...payload }) => {

    return await internals.fetchFromWreck('post', `/secrets/${name}`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });
};

exports.fetchSecret = async (jwt, remote, secretName) => {

    return await internals.fetchFromWreck('get', `/secrets/${secretName}`, {
        baseUrl: remote,
        headers: { authorization: jwt }
    });
};

exports.listSecrets = async (jwt, remote) => {

    return await internals.fetchFromWreck('get', `/secrets/list`, {
        baseUrl: remote,
        headers: { authorization: jwt }
    });
};

//////// TODO WTF
exports.init = () => ([{
    secrets: [],
    jwt: null
}]);

internals.ensurePassword = async (password) => {

    password = password || await Helpers.prompt('Enter remote password', 'password');
    return password;
};

internals.createUser = async (remotePath, { fingerprint, pubKey }, password) => {

    let res = await Wreck.request('post', '/users/create', {
        baseUrl: remotePath,
        payload: {
            publicKey: pubKey,
            fingerprint,
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

internals.saveJwt = async ({ user, remotePath, remotes, jwt }) => {

    const { fingerprint } = user;

    remotes = {
        ...remotes,
        [remotePath]: {
            ...remotes[remotePath],
            jwt
        }
    };

    await Doggo.api.encrypt(user, JSON.stringify(remotes), LOCAL_REMOTES_PATH(fingerprint));
};

internals.getLoggedIn = async (remotePath, jwt) => {

    return await internals.fetchFromWreck('get', '/user', {
        baseUrl: remotePath,
        headers: { authorization: jwt }
    });
};

internals.fetchFromWreck = async (...args) => {

    const res = await Wreck.request(...args);
    const readRes = await Wreck.read(res);

    return Bourne.parse(readRes.toString('utf8'));
};
