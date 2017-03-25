
const Wreck = require('wreck');
const Items = require('items');
const CopyPaste = require('copy-paste');
const Prompt = require('prompt');

let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const doggoClient = require('./doggo-cli-client')(Program, DoggoNative);
    const db = dbUtils.db;

    if (!registeredCmd) {

        registeredCmd = true;

        Program
        .command('find <user> <remote> <searchStr>')
        .alias('fetch')
        .description('Fetch a resource')
        .action((userName, remoteName, searchStr) => {

            dbUtils.assertExists('Users', { name: userName })
            .then((user) => {

                dbUtils.assertExists('Remotes', { name: remoteName })
                .then((remote) => {

                    doggoClient.remoteAuthRequest(remote, user, 'GET', `/doggo/users/secure/search/${searchStr}`)
                    .then((payload) => {

                        Prompt.start();
                        Prompt.get({
                            properties: {
                                secretKeyPassword: {
                                    description: 'Enter secret key password',
                                    hidden: true
                                }
                            }
                        },
                        (err, promptRes) => {

                            const decryptPassword = promptRes.secretKeyPassword

                            const decryptedSecures = [];
                            Items.parallel(payload, (item, next) => {

                                // TODO Ummmm this decrypts with all passwords for ECC right now...
                                // Yeeeahh...
                                DoggoNative.decryptText(decryptPassword, item.secureItem)
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
                        });
                    })
                    .catch(dbUtils.onErrorDestroy);
                })
                .catch(dbUtils.onErrorDestroy);
            })
            .catch(dbUtils.onErrorDestroy);
        });
    }
};
