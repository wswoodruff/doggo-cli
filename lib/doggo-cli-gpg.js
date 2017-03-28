
const Prompt = require('prompt');

let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    if (!registeredCmd) {

        registeredCmd = true;

        Program
        .command('getFingerprintFor <keyIdentifier...>')
        .description('Get fingerprint for user identified by "key identifier"')
        .action((keyIdentifier) => {

            if (Array.isArray(keyIdentifier)) {
                keyIdentifier = keyIdentifier.join(' ');
            }

            console.log('Getting fingerprint for "' + keyIdentifier + '"');

            DoggoNative.getFingerprintFor(keyIdentifier)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('genKeys')
        .description('Generate keys for a new user')
        .action(() => {

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
                    return console.log(err);
                }

                if (promptRes.password !== promptRes.confirmPassword) {
                    return console.log('Passwords don\'t match. Try again');
                }

                DoggoNative.genKeys(promptRes.email, promptRes.username, promptRes.password, `Doggo User ${promptRes.username}`)
                .then(console.log)
                .catch(console.log);
            });
        });

        Program
        .command('deleteKeyFor <fingerprint> <keyType>')
        .alias('removeKeyFor')
        .description('Delete a key for user (use fingerprint)')
        .action((fingerprint, keyType) => {

            DoggoNative.deleteKeyFor(fingerprint, keyType)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('deleteAllKeysFor <fingerprint>')
        .alias('removeAllKeysFor')
        .description('Delete all keys for a user (use fingerprint)')
        .action((fingerprint) => {

            DoggoNative.deleteAllKeysFor(fingerprint)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('importKey <keyPath>')
        .description('Import a key')
        .action((keyPath) => {

            DoggoNative.importKey(keyPath)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('exportKey <fingerprint> <keyType> <keySavePath>')
        .description('Export a "secret" or "public" key for user to a file (use fingerprint)')
        .action((fingerprint, keyType, keySavePath) => {

            DoggoNative.exportKey(fingerprint, keyType, keySavePath)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('getKey <fingerprint> <keyType> <password>')
        .description('Get a "secret" or "public" key for user (use fingerprint)')
        .action((fingerprint, keyType, password) => {

            DoggoNative.getKey(fingerprint, keyType, password)
            .then(console.log)
            .catch(console.log);
        })

        // Program
        // .command('getKey <fingerprint> <keyType>')
        // .description('Get a "secret" or "public" key for user (use fingerprint)')
        // .action((fingerprint, keyType) => {

        //     DoggoNative.getKey(fingerprint, keyType)
        //     .then(console.log)
        //     .catch(console.log);
        // })

        Program
        .command('listKeys')
        .alias('keys')
        .description('List all keys')
        .action((keyIdentifier) => {

            DoggoNative.listKeys()
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('listKeysFor <keyIdentifier>')
        .description('Check if key exists or list keys for given key identifier')
        .action((keyIdentifier) => {

            DoggoNative.listKeysFor(keyIdentifier)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('encryptFor <fingerprint> <srcFile> <destFile>')
        .description('Encrypt a file for user (use fingerprint)')
        .action((fingerprint, srcFile, destFile) => {

            DoggoNative.encryptFor(fingerprint, srcFile, destFile)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('encryptText <text>')
        .description('Encrypt a string of text with a password')
        .action((text) => {

            Prompt.get({
                properties: {
                    encryptPassword: {
                        hidden: true,
                        description: 'Encryption password'
                    }
                }
            }, (err, promptRes) => {

                if (err) {
                    return console.log(err);
                }

                DoggoNative.encryptText(promptRes.encryptPassword, text)
                .then(console.log)
                .catch(console.log);
            });
        });

        Program
        .command('encryptTextToFile <text> <fileName>')
        .description('Encrypt a string of text into a file with a password')
        .action((text, fileName) => {

            Prompt.get({
                properties: {
                    encryptPassword: {
                        hidden: true,
                        description: 'Encryption password'
                    }
                }
            }, (err, promptRes) => {

                if (err) {
                    return console.log(err);
                }

                Fs.writeFileSync(fileName, text);
                const filePath = `${process.cwd()}/${fileName}`;

                DoggoNative.passwordEncryptFile(promptRes.encryptPassword, filePath)
                .then(console.log)
                .catch(console.log);
            });
        });

        Program
        .command('encryptTextFor <fingerprint> <text>')
        .description('Encrypt text for user (use fingerprint)')
        .action((fingerprint, text) => {

            DoggoNative.encryptTextFor(fingerprint, text)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('decryptFile <filePath>')
        .description('Decrypt a file with a password')
        .action((filePath) => {

            Prompt.start();
            Prompt.get({
                properties: {
                    decryptPassword: {
                        hidden: true,
                        description: 'Decrypt password'
                    }
                }
            }, (err, promptRes) => {

                if (err) {
                    return console.log(err);
                }

                DoggoNative.decryptFile(promptRes.decryptPassword, `${process.cwd()}/${filePath}`)
                .then(console.log)
                .catch(console.log);
            });
        });

        Program
        .command('getDecryptedFileContents <filePath>')
        .description('Decrypt a file with a password')
        .action((filePath) => {

            Prompt.start();
            Prompt.get({
                properties: {
                    decryptPassword: {
                        hidden: true,
                        description: 'Decrypt password'
                    }
                }
            }, (err, promptRes) => {

                if (err) {
                    return console.log(err);
                }

                DoggoNative.getDecryptedFileContents(promptRes.decryptPassword, `${process.cwd()}/${filePath}`)
                .then(console.log)
                .catch(console.log);
            });
        });
    };
}