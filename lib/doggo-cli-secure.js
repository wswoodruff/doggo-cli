
const Items = require('items');
const Prompt = require('prompt');
const CopyPaste = require('copy-paste');

let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const utils = require('./doggo-cli-utils')(Program, DoggoNative);
    const doggoClient = require('./doggo-cli-client')(Program, DoggoNative);
    const db = dbUtils.db;

    if (!registeredCmd) {

        registeredCmd = true;

        const subCommandUsage = {
            addCreate: 'doggo secure add <password|file|text> [user|group|organization]'
        }

        Program
        .command('secure [cmd] [params...]')
        .description('Work with secures')
        .action((cmd, params) => {

            switch (cmd) {

                case 'ls':
                    (() => {
                        dbUtils.getDefaultUserRemote()
                        .then((userRemote) => {

                            const user = userRemote.user;
                            const remote = userRemote.remote;

                            doggoClient.remoteAuthRequest(remote, user, 'GET', `/doggo/users/secure/all`)
                            .then((payload) => {

                                const decryptedSecures = [];
                                Items.parallel(payload, (item, next) => {

                                    DoggoNative.decryptText(user.encryptionPassword, item.secureItem)
                                    .then((decryptedSecure) => {

                                        item.secureItem = JSON.parse(decryptedSecure);
                                        decryptedSecures.push(item);
                                        next();
                                    })
                                    .catch(next);
                                },
                                (err) => {

                                    if (err) {
                                        return dbUtils.onErrorDestroy(err);
                                    }

                                    dbUtils.logAndDestroy(decryptedSecures);

                                    if (decryptedSecures.length === 1) {
                                        if (decryptedSecures[0].secureItem.password) {
                                            CopyPaste.copy(decryptedSecures[0].secureItem.password);
                                            console.log('');
                                            console.log('Password copied to clipboard');
                                            console.log('');
                                        }
                                    }
                                });
                            })
                            .catch(dbUtils.onErrorDestroy);
                        })
                        .catch(dbUtils.onErrorDestroy);
                    })();

                    break;

                case 'add':
                case 'create':

                    (() => {
                        const [ secureType ] = utils.assertParams(params, 1, subCommandUsage.addCreate);

                        const asyncActions = [];
                        let secureItem = {};

                        switch (secureType) {

                            case 'password':

                                asyncActions.push((next) => {

                                    Prompt.start();
                                    Prompt.get({
                                        properties: {
                                            generatePassword: {
                                                description: 'Generate password? [yes/no]'
                                            }
                                        }
                                    },
                                    (err, firstPromptRes) => {

                                        if (err) {
                                            return dbUtils.onErrorDestroy(err);
                                        }

                                        firstPromptRes.generatePassword = firstPromptRes.generatePassword.toLowerCase();

                                        let promptProps = {
                                            username: {
                                                description: 'Enter username associated with this password'
                                            }
                                        };

                                        if (firstPromptRes.generatePassword !== 'yes' &&
                                        firstPromptRes.generatePassword !== 'y') {

                                            promptProps = Object.assign(promptProps, {
                                                password: {
                                                    hidden: true,
                                                    description: 'Enter password'
                                                },
                                                confirmPassword: {
                                                    hidden: true,
                                                    description: 'Confirm password'
                                                }
                                            });
                                        }

                                        promptProps = Object.assign(promptProps, {
                                            key: {
                                                description: 'Enter a key to reference this item by'
                                            },
                                            url: {
                                                description: 'Enter URL (optional)'
                                            },
                                            description: {
                                                description: 'Enter description. This will be searchable when finding it later (optional)'
                                            },
                                            extras: {
                                                description: 'Enter any extra info here like security questions if you\'d like (optional)'
                                            }
                                        });

                                        Prompt.start();
                                        Prompt.get({
                                            properties: promptProps
                                        },
                                        (err, promptRes) => {

                                            if (err) {
                                                return dbUtils.onErrorDestroy(err);
                                            }

                                            if (firstPromptRes.password !== firstPromptRes.confirmPassword) {
                                                return dbUtils.onErrorDestroy('Passwords don\'t match. Try again');
                                            }

                                            delete promptRes.confirmPassword;

                                            if (firstPromptRes.generatePassword === 'yes' ||
                                            firstPromptRes.generatePassword === 'y') {
                                                secureItem = promptRes;
                                                secureItem.password = DoggoNative.genPassword();
                                            }
                                            else {
                                                secureItem = promptRes;
                                            }

                                            next();
                                        });
                                    });
                                });
                                break;

                            case 'file':

                                return dbUtils.logAndDestroy('Files not supported yet');
                                asyncActions.push((next) => {

                                    Prompt.start();
                                    Prompt.get({
                                        properties: {
                                            filePath: {
                                                description: 'Enter filepath'
                                            },
                                            key: {
                                                description: 'Enter a key to reference this item by'
                                            },
                                            description: {
                                                description: 'Enter description. This will be searchable when finding it later (optional)'
                                            },
                                            extras: {
                                                description: 'Enter any extra info here like security questions if you\'d like (optional)'
                                            }
                                        }
                                    },
                                    (err, promptRes) => {

                                        if (err) {
                                            return dbUtils.onErrorDestroy(err);
                                        }

                                        secureItem = promptRes;

                                        next();
                                    });
                                });
                                break;

                            case 'text':

                                asyncActions.push((next) => {

                                    Prompt.get({
                                        properties: {
                                            text: {
                                                description: 'Enter secure text'
                                            },
                                            key: {
                                                description: 'Enter a key to reference this item by'
                                            },
                                            description: {
                                                description: 'Enter description. This will be searchable when finding it later (optional)'
                                            },
                                            extras: {
                                                description: 'Enter any extra info here like security questions if you\'d like (optional)'
                                            }
                                        }
                                    },
                                    (err, promptRes) => {

                                        if (err) {
                                            return dbUtils.onErrorDestroy(err);
                                        }

                                        secureItem = promptRes;

                                        next();
                                    });
                                });
                                break;

                            case 'json':

                                asyncActions.push((next) => {

                                    Prompt.get({
                                        properties: {
                                            json: {
                                                description: 'Enter secure json'
                                            },
                                            key: {
                                                description: 'Enter a key to reference this item by'
                                            },
                                            description: {
                                                description: 'Enter description. This will be searchable when finding it later (optional)'
                                            },
                                            extras: {
                                                description: 'Enter any extra info here like security questions if you\'d like (optional)'
                                            }
                                        }
                                    },
                                    (err, promptRes) => {

                                        if (err) {
                                            return dbUtils.onErrorDestroy(err);
                                        }

                                        secureItem = promptRes;

                                        next();
                                    });
                                });
                                break;
                        };

                        dbUtils.getDefaultUserRemote()
                        .then((secureResults) => {

                            Items.serial(asyncActions, (item, next) => {

                                item(next);
                            },
                            (err) => {

                                if (err) {
                                    return dbUtils.onErrorDestroy(err);
                                }

                                const secureUser = secureResults.user;
                                const secureRemote = secureResults.remote;

                                // secureItem props are populated above
                                const secureSearchable = {
                                    key: secureItem.key,
                                    description: secureItem.description
                                };

                                delete secureItem.key;
                                delete secureItem.description;

                                DoggoNative.encryptTextFor(secureUser.fingerprint, JSON.stringify(secureItem))
                                .then((encryptedSecureItem) => {

                                    const requestPayload = Object.assign({
                                        secureItem: encryptedSecureItem,
                                        type: secureType
                                    }, secureSearchable);

                                    doggoClient.remoteAuthRequest(
                                        secureRemote,
                                        secureUser,
                                        'POST',
                                        '/doggo/secureItems',
                                        requestPayload
                                    )
                                    .then((res) => {

                                        dbUtils.logAndDestroy(res);
                                    })
                                    .catch(dbUtils.onErrorDestroy);
                                })
                                .catch(dbUtils.onErrorDestroy);
                            });
                        })
                        .catch(dbUtils.onErrorDestroy);
                    })();
                    break;

                default:
                    console.log('--help');
                    const subCommandKeys = Object.keys(subCommandUsage);
                    console.log(subCommandKeys.reduce((collector, key, i) => {

                        collector += `    ${subCommandUsage[key]}`;

                        if (i < subCommandKeys.length - 1) {
                            collector += '\n';
                        }

                        return collector;
                    }, ''));
                    break;
            }
        });
    }
}
