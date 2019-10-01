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

    const remotes = await Helpers.withErrHandling(Doggo.api.decrypt, LOCAL_REMOTES_PATH(fingerprint));

    let jwt;

    if (!remotes[remotePath] || !remotes[remotePath].jwt) {

        const hasAccount = await Helpers.prompt('Do you have an account on this server?', 'confirm');

        password = password || await internals.ensurePassword(password);

        if (!hasAccount) {

            if (password !== await internals.ensurePassword('', 'Confirm remote password')) {
                return [new Error('Passwords do not match')];
            }

            const [createErr] = await internals.createUser(remotePath, { fingerprint, pubKey }, password);

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

    return await internals.hitApi('post', `/secrets`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });
};

exports.updateSecret = async (jwt, remote, { name, ...payload }) => {

    return await internals.hitApi('post', `/secrets/${name}`, {
        baseUrl: remote,
        headers: { authorization: jwt },
        payload
    });
};

exports.fetchSecret = async (jwt, remote, secretName) => {

    let error;
    let readRes;

    try {
        const res = await Wreck.request('get', `/secrets/${secretName}`, {
            baseUrl: remote,
            headers: { authorization: jwt }
        });

        readRes = await Wreck.read(res);
    }
    catch (err) {
        error = err;
    }

    return [error, readRes];
};

exports.listSecrets = async (jwt, remote) => {

    return await internals.hitApi('get', '/secrets/list', {
        baseUrl: remote,
        headers: { authorization: jwt }
    });
};

//////// TODO WTF
exports.init = () => ([{
    secrets: [],
    jwt: null
}]);

internals.ensurePassword = async (password, msg) => {

    return password || await Helpers.prompt(msg || 'Enter remote password', 'password');
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

    return [res.error, res.results];
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
    res = res.toString('utf8');

    let parsedRes;

    // Try to parse it. It may be that the site is down and you get
    // html back from this route
    try {
        parsedRes = Bourne.parse(res);
    }
    catch (err) {
        // Maybe we're trying to parse some other string
        if (!err instanceof SyntaxError) {
            throw err;
        }
    }

    if (res.includes('<html>')) {
        throw new Error('\n\nOh! Something might be wrong with the site. Here\'s the html:\n\n' + res);
    }

    if (!parsedRes) {
        throw new Error('\n\nUnknown problem! Here\'s the result:\n\n', res);
    }

    // 'results' is a jwt
    const { results, error } = parsedRes;

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

    return await internals.hitApi('get', '/user', {
        baseUrl: remotePath,
        headers: { authorization: jwt }
    });
};

internals.hitApi = async (...args) => {

    let error;
    let results;

    try {
        const res = await Wreck.request(...args);
        const readRes = await Wreck.read(res);

        const { error: parsedError, results: parsedResults } = Bourne.parse(readRes.toString('utf8'));

        error = parsedError;
        results = parsedResults;
    }
    catch (err) {
        error = err;
    }

    return [error, results];
};
