
const Wreck = require('wreck');
const Items = require('items');
const CopyPaste = require('copy-paste');

let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const doggoClient = require('./doggo-cli-client')(Program, DoggoNative);
    const db = dbUtils.db;

    if (!registeredCmd) {

        registeredCmd = true;

        Program
        .command('find <searchStr>')
        .alias('fetch')
        .description('Fetch a resource')
        .action((searchStr) => {

            dbUtils.getDefaultUserRemote()
            .then((userRemote) => {

                const user = userRemote.user;
                const remote = userRemote.remote;

                doggoClient.remoteAuthRequest(remote, user, 'GET', `/doggo/users/secure/search/${searchStr}`)
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
        });
    }
};
