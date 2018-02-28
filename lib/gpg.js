
const Prompt = require('prompt');

const registeredCmd = {
    val: false
};

module.exports = (Program, DoggoNative) => {

    if (!registeredCmd.val) {

        registeredCmd.val = true;

        Program
        .command('getFingerprint [keyIdentifier...]')
        .description('Get fingerprint for user identified by "key identifier"')
        .action((keyIdentifier) => {

            // In case the key identifier contains spaces

            if (Array.isArray(keyIdentifier)) {
                keyIdentifier = keyIdentifier.join(' ');
            }

            console.log('Getting fingerprint for "' + keyIdentifier + '"');

            DoggoNative.getFingerprint(keyIdentifier)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('genKeys')
        .description('Generate keys for a new user')
        .action(() => {

            DoggoNative.genKeys()
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('deleteKey <fingerprint> <keyType>')
        .description('Delete a key for user <fingerprint>')
        .action((fingerprint, keyType) => {

            DoggoNative.deleteKey(fingerprint, keyType)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('deleteAllKeys <fingerprint>')
        .description('Delete all keys for user <fingerprint>')
        .action((fingerprint) => {

            DoggoNative.deleteAllKeys(fingerprint)
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
        .description('Export a "secret" or "public" key for user <fingerprint> to a file')
        .action((fingerprint, keyType, keySavePath) => {

            DoggoNative.exportKey(fingerprint, keyType, keySavePath)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('getKey <fingerprint> <keyType>')
        .description('Get a "secret" or "public" key for user <fingerprint>')
        .action((fingerprint, keyType) => {

            DoggoNative.getKey(fingerprint, keyType)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('listKeys [keyIdentifier]')
        .description('Check if key exists or list keys for given key identifier')
        .action((keyIdentifier) => {

            DoggoNative.listKeys(keyIdentifier)
            .then(console.log)
            .catch(console.log);
        });

        Program
        .command('encrypt <fingerprint> [src] [destFile]')
        .option('--symmetric')
        .description('Encrypt a file for user <fingerprint>')
        .action((fingerprint, src, destFile, options) => {

            // If no destFile is provided, the contents will be logged to the console

            DoggoNative.encryptFor(fingerprint, src, destFile, options.symmetric)
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

            DoggoNative.getDecryptedFileContents(`${process.cwd()}/${filePath}`)
            .then(console.log)
            .catch(console.log);
        });
    };
}
