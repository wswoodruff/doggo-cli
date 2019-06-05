const Os = require('os');

exports.INVALID_ARGS = 'Invalid args';
exports.COMMANDS_SPACING = 8;
exports.INDENT_SPACING = 2;
exports.LOCAL_TAG_FILE_PATH = (fingerprint) => `${Os.homedir()}/doggo/local-dog-tag-${fingerprint}.gpg`;
exports.LOCAL_REMOTES_PATH = (fingerprint) => `${Os.homedir()}/doggo/doggo-dish-creds-${fingerprint}.gpg`;
exports.DEFAULT_DOG_TAG_NAME = 'default-dog-tag';
exports.DOGGO_DISH_DEFAULT_REMOTE_PATH = process.env.API_HOST || 'http://localhost:4000';
