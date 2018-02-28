'use strict';

module.exports = {
    development: {
        client: 'sqlite3',
        connection: {
            filename: `${__dirname}/doggo.sqlite`
        },
        migrations: {
            directory: `${__dirname}/migrations`
        },
        useNullAsDefault: true
    },
    test: {
        client: 'sqlite3',
        connection: {
            filename: ':memory:'
        },
        migrations: {
            directory: `${__dirname}/migrations`
        },
        useNullAsDefault: true
    }
};
