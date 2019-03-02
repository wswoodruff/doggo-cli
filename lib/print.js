'use strict';

const internals = {};

exports.colors = (enabled) => {

    const codes = {
        bold: 1,
        red: 31,
        green: 32,
        yellow: 33,
        grey: 92
    };

    const colors = {};

    const names = Object.keys(codes);
    for (let i = 0; i < names.length; ++i) {
        const name = names[i];
        colors[name] = internals.color(name, codes[name], enabled);
    }

    return colors;
};

internals.color = function (name, code, enabled) {

    if (!enabled) {
        return (text) => text;
    }

    return (text) => `\u001b[${code}m${text}\u001b[0m`;
};
