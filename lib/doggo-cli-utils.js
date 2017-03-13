
let registeredCmd = false;

module.exports = (Program, DoggoNative) => {

    const dbUtils = require('./doggo-cli-db')(Program, DoggoNative);
    const db = dbUtils.db;

    if (!registeredCmd) {

        registeredCmd = true;

        Program
        .command('genPassword')
        .description('Generate a password')
        .action(() => {

            console.log(DoggoNative.genPassword());
        });
    }

    return {

        assertParams: (params, numRequired, helpMessage) => {

            if (params.length < numRequired) {
                dbUtils.logAndDestroy(`--help ${helpMessage}`);
                return process.exit(1);
            }

            return params;
        }
    };
};
