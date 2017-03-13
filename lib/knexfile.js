'use strict';

module.exports = {

    development: {
        client: 'sqlite3',
        connection: {
            filename: `${__dirname}/doggo.sqlite`
        },
        useNullAsDefault: true
    },
    test: {
        client: 'sqlite3',
        connection: {
            filename: ':memory:'
        },
        useNullAsDefault: true
    }
};
