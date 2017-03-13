
exports.up = function(knex, Promise) {

    return Promise.all([

        knex.schema.createTableIfNotExists('Settings', function (table) {

            table.increments();
            table.timestamps();
            table.string('defaultUser');
            table.string('defaultRemote');
            table.integer('keepUnlocked');
        }),

        knex.schema.createTableIfNotExists('Users', function (table) {

            table.increments();
            table.timestamps();
            table.string('email').unique();
            table.string('name').unique();
            table.string('fingerprint');
            table.string('publicKey', 4000);
            table.string('encryptionPassword');
            table.string('jwt');
        }),

        knex.schema.createTableIfNotExists('Remotes', function (table) {

            table.increments();
            table.timestamps();
            table.string('name').unique();
            table.string('url');
        }),

        knex.schema.createTableIfNotExists('RemotesUsers', function (table) {

            table.string('userName');
            table.string('remoteName');
        })
    ]);
};

exports.down = function(knex, Promise) {

    //
};

/*
        db.run(`CREATE TABLE IF NOT EXISTS Settings (
            id INTEGER,
            defaultuser TEXT,
            defaultremote TEXT,
            keepunlocked INTEGER,
            CONSTRAINT id_unique UNIQUE (id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Remotes (
            name TEXT,
            url TEXT,
            CONSTRAINT name_unique UNIQUE (name)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS Users (
            email TEXT,
            username TEXT,
            fingerprint TEXT,
            publicKey TEXT,
            password TEXT,
            jwt TEXT,
            CONSTRAINT email_unique UNIQUE (email),
            CONSTRAINT name_unique UNIQUE (username)
        )`);

        // Join table
        db.run(`CREATE TABLE IF NOT EXISTS RemotesUsers (
            username TEXT,
            remotename TEXT
        )`);

        db.get('SELECT * FROM Settings WHERE id = ?', 1, (err, rows) => {

            if (err) {
                return console.log(err);
            }
            if (!rows) {
                db.serialize(() => {

                    db.run('INSERT INTO Settings(id,defaultuser,keepunlocked) VALUES(?,?,?)', [1, null, 1], (err) => {

                        if (err) {
                            return console.log(err);
                        }
                        resolve(db);
                    });
                });
            }
            else {
                return resolve(db);
            }
        });
    });
    */