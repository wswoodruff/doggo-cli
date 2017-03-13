
const Prompt = require('prompt');

let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    const utils = require('./doggo-cli-utils')(Program, DoggoNative);
    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const doggoClient = require('./doggo-cli-client')(Program, DoggoNative);
    const db = dbUtils.db;

    if (!registeredCmd) {

        registeredCmd = true;

        const subCommandUsage = {
            ls: 'doggo user ls',
            addCreate: 'doggo user add|create',
            setDefault: 'doggo user set-default <username|email>',
            removeDelete: 'doggo user remove|delete <username|email>',
            migrate: 'doggo user migrate <username|email> <remoteName>'
        }

        Program
        .command('user [cmd] [params...]')
        .description('Work with users')
        .action((cmd, params) => {

            switch (cmd) {

                case 'ls':

                    (() => {
                        dbUtils.listTable('Users')
                        .then(() => {

                            db.destroy();
                        });
                    })();
                    break;

                case 'add':
                case 'create':

                    (() => {
                        Prompt.start();
                        Prompt.get({
                            properties: {
                                email: {
                                    description: 'Enter Email'
                                },
                                username: {
                                    description: 'Enter Username'
                                },
                                password: {
                                    hidden: true,
                                    description: 'Create secret key password. Make it good!'
                                },
                                confirmPassword: {
                                    hidden: true,
                                    description: 'Confirm password'
                                }
                            }
                        }, (err, promptRes) => {

                            if (err) {
                                return dbUtils.onErrorDestroy(err);
                            }

                            if (promptRes.password !== promptRes.confirmPassword) {
                                return dbUtils.logAndDestroy('Passwords don\'t match. Try again');
                            }

                            // See if username already exists
                            dbUtils.checkUserExists(promptRes.username)
                            .then((user) => {

                                if (user) {
                                    return dbUtils.onErrorDestroy(`There is already a user with username: "${promptRes.username}"`);
                                }

                                DoggoNative.genKeys(
                                    promptRes.email,
                                    promptRes.username,
                                    promptRes.password,
                                    `Doggo User ${promptRes.username}`
                                )
                                .then(() => {

                                    DoggoNative.getFingerprintFor(`Doggo User ${promptRes.username}`)
                                    .then((fingerprint) => {

                                        DoggoNative.getKey(fingerprint, 'public')
                                        .then((publicKey) => {

                                            db('Users')
                                            .insert({
                                                email: promptRes.email,
                                                name: promptRes.username,
                                                fingerprint: fingerprint,
                                                publicKey: publicKey,
                                                encryptionPassword: promptRes.password
                                            })
                                            .then((user) => {

                                                db('Users')
                                                .select()
                                                .then((allUsers) => {

                                                    if (allUsers.length === 1) {

                                                        db('Settings')
                                                        .where({ id: 1 })
                                                        .update({ defaultUser: allUsers[0].name })
                                                        .then(() => {

                                                            console.log('');
                                                            console.log(`Default user set to "${allUsers[0].name}"`);
                                                            console.log('');

                                                            dbUtils.getSettings()
                                                            .then((settings) => {

                                                                return dbUtils.logAndDestroy(`Current settings: ${JSON.stringify(settings, undefined, 4)}`);

                                                            });
                                                        })
                                                        .catch(dbUtils.onErrorDestroy);
                                                    }
                                                    else {
                                                        return dbUtils.logAndDestroy('Success');
                                                    }
                                                })
                                                .catch(dbUtils.onErrorDestroy);
                                            })
                                            .catch(dbUtils.onErrorDestroy);
                                        })
                                        .catch(dbUtils.onErrorDestroy);
                                    })
                                    .catch(dbUtils.onErrorDestroy);
                                })
                                .catch(dbUtils.onErrorDestroy);
                            })
                            .catch(dbUtils.onErrorDestroy);
                        });
                    })();
                    break;

                case 'set-default':

                    (() => {
                        const [ usernameOrEmail ] = utils.assertParams(params, 1, subCommandUsage.setDefault);

                        dbUtils.getUser(usernameOrEmail)
                        .then((user) => {

                            db('Settings')
                            .where({ id: 1 })
                            .update({ defaultUser: user.name })
                            .then(() => {

                                dbUtils.getSettings()
                                .then((settings) => {

                                    console.log('');
                                    console.log(`Default user set to "${user.name}"`);
                                    console.log('');
                                    dbUtils.logAndDestroy(`Current settings: ${JSON.stringify(settings, undefined, 4)}`);
                                })
                                .catch(dbUtils.onErrorDestroy);
                            })
                            .catch(dbUtils.onErrorDestroy);
                        })
                        .catch(dbUtils.onErrorDestroy);
                    })();
                    break;

                case 'remove':
                case 'delete':

                    (() => {
                        const [ usernameOrEmail ] = utils.assertParams(params, 1, subCommandUsage.removeDelete);

                        dbUtils.getUser(usernameOrEmail)
                        .then((user) => {

                            Prompt.start();
                            Prompt.get({
                                properties: {
                                    areYouSure: {
                                        description: `\nAre you absolutely sure you want to delete user ${user.name}?\nYou won't be able to decrypt any secure items associated with this user [yes/no]`
                                    }
                                }
                            }, (err, promptRes) => {

                                if (err) {
                                    return console.log(err);
                                }

                                promptRes.areYouSure = promptRes.areYouSure.toLowerCase();

                                if (promptRes.areYouSure === 'yes' ||
                                    promptRes.areYouSure === 'y') {

                                    db('Users')
                                    .where({ name: user.name })
                                    .delete()
                                    .then(() => {

                                        db('RemotesUsers')
                                        .where({ userName: user.name })
                                        .delete()
                                        .then(() => {

                                            db('Settings')
                                            .update({ defaultUser: null })
                                            .where({ defaultUser: user.name })
                                            .then(() => {

                                                DoggoNative.removeAllKeysFor(user.fingerprint)
                                                .then(() => {

                                                    return dbUtils.logAndDestroy(`Deleted user ${user.name}`);
                                                })
                                                .catch(dbUtils.onErrorDestroy);
                                            })
                                            .catch(dbUtils.onErrorDestroy);
                                        })
                                        .catch(dbUtils.onErrorDestroy);
                                    })
                                    .catch(dbUtils.onErrorDestroy);
                                }
                            });
                        });
                    })();
                    break;

                case 'migrate':

                    (() => {
                        const [ usernameOrEmail, remoteName ] = utils.assertParams(params, 2, subCommandUsage.migrate);

                        dbUtils.getUser(usernameOrEmail)
                        .then((foundUser) => {

                            dbUtils.assertExists('Remotes', { name: remoteName })
                            .then((foundRemote) => {

                                // doggoClient.remoteAuthRequest = (remote, user, method, route, requestPayload) => {
                                doggoClient.remoteAuthRequest(foundRemote, foundUser, 'GET', '/doggo/users/migrate')
                                .then((res) => {

                                    dbUtils.logAndDestroy(res);
                                })

                                // doggoClient.remoteAuthRequest();
                                ///////////////////
                            })
                            .catch(dbUtils.onErrorDestroy);
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
            };
        });
    }
}
