'use strict';

var _ = require('underscore');

module.exports = SMTPClient;

SMTPClient.prototype.constructor = SMTPClient;

function SMTPClient() {

}

SMTPClient.prototype.connect = function (host, port) {
    return new Promise(function (resolve, reject) {

    });
};

SMTPClient.prototype.command = function (socket, command) {
    return new Promise(function (resolve, reject) {

    });
};

SMTPClient.prototype.data = function (socket, buffer) {
    return new Promise(function (resolve, reject) {

    });
};

SMTPClient.prototype.close = function (socket) {

};
