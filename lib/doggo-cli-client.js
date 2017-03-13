
const Wreck = require('wreck');
const Prompt = require('prompt');

module.exports = (Program, DoggoNative) => {

    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const db = dbUtils.db;

    const doggoClient = {};

    doggoClient.remoteRequest = (remote, method, route, requestOptions) => {

        return new Promise((resolve, reject) => {

            if (route.indexOf('/doggo') === -1) {

                return dbUtils.onErrorDestroy('Doggo routes need to be prefixed with "/doggo"');
            }

            Wreck.request(
                method,
                `${remote.url}${route}`,
                requestOptions,
                (err, res) => {

                if (err) {
                    return reject(err);
                }

                Wreck.read(res, {}, (err, parsedPayload) => {

                    if (Buffer.isBuffer(parsedPayload)) {
                        parsedPayload = parsedPayload.toString('utf8');
                    }

                    try {
                        parsedPayload = JSON.parse(parsedPayload);
                    }
                    catch (ignore) {}

                    return resolve(parsedPayload);
                });
            });
        })
        .catch(dbUtils.onErrorDestroy);
    };

    doggoClient.remoteAuthRequest = (remote, user, method, route, requestPayload) => {

        const requestOptions = {
            headers: {
                authorization: user.jwt
            },
            payload: requestPayload
        };

        return doggoClient.remoteRequest(remote, method, route, requestOptions);
    };

    doggoClient.loginUserToRemote = (loginRemote, loginUser, loginPassword) => {

        return new Promise((resolve, reject) => {

            let passwordPromise;

            if (!loginPassword) {
                passwordPromise = new Promise((rslv, rjct) => {

                    Prompt.get({
                        properties: {
                            remotePassword: {
                                hidden: true,
                                description: 'Remote password'
                            }
                        }
                    }, (err, promptRes) => {

                        if (err) {

                            return dbUtils.onErrorDestroy(err);
                        }

                        return rslv(promptRes.remotePassword);
                    });
                })
                .catch(reject);
            }
            else {
                passwordPromise = Promise.resolve(loginPassword);
            }

            passwordPromise.then((password) =>{

                doggoClient.remoteRequest(loginRemote, 'POST', '/doggo/login', {
                    payload: {
                        email: loginUser.email,
                        password: password
                    }
                })
                .then((payload) => {

                    if (payload.message && payload.message === 'User or Password is invalid') {
                        dbUtils.onErrorDestroy(payload.message);
                    }

                    db('RemotesUsers')
                    .insert({
                        remoteName: loginRemote.name,
                        userName: loginUser.name
                    })
                    .then(() => {

                        db('Users')
                        .update({ jwt: payload })
                        .where({ name: loginUser.name })
                        .then(() => {

                            console.log(`User ${loginUser.name} logged into remote ${loginRemote.name}`);
                            return resolve(payload)
                        });
                    });
                })
                .catch(reject);
            })
        })
        .catch(dbUtils.onErrorDestroy);
    };

    doggoClient.createUser = doggoClient.addUser = (remote, user, password) => {

        return new Promise((resolve, reject) => {

            doggoClient.remoteRequest(remote, 'POST', '/doggo/users', {
                payload: {
                    email: user.email,
                    password: password,
                    firstName: user.username,
                    publicKey: user.publicKey
                }
            })
            .then((payload) => {

                if (payload.message && payload.message.indexOf('Unique email error:') > -1) {
                    console.log(`User "${user.name}" already exists on remote. Trying login.`);
                }

                doggoClient.loginUserToRemote(remote, user, password)
                .then((payload) => {

                    return resolve(`Success. User ${user.username} linked with remote ${remote.name}`);
                });
            })
            .catch((err) => {

                console.log(err);
            })
        });
    };

    return doggoClient;
};
