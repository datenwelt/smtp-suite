'use strict';

var os = require('os');

module.exports = SMTPClientEhlo;

SMTPClientEhlo.prototype.constructor = SMTPClientEhlo;

function SMTPClientEhlo(options) {
	options = Object.assign({
		hostname: os.hostname()
	}, options);
}

SMTPClientEhlo.prototype.register = function(session) {
	
};

SMTPClientEhlo.prototype.onConnected = function(session, callback) {
	
};