'use strict';

var _ = require('underscore');
var net = require('net');

var SMTPReplyParser = require('./parsers/reply');
var SMTPCommandParser = require('./parsers/command');

module.exports = SMTPClient;

SMTPClient.prototype.constructor = SMTPClient;

function SMTPClient(options) {
	options = Object.assign({
		timeout: 300000,
		maxReplyLineLength: 512,
		maxCommandLineLength: 512,
		maxDataLineLength: 1000
	}, options || {});
	this.timeout = options.timeout;
	this.maxReplyLineLength = options.maxReplyLineLength;
	this.maxCommandLineLength = options.maxCommandLineLength;
	this.maxDataLineLength = options.maxDataLineLength;
}

SMTPClient.prototype.connect = function (host, port, options) {
	options = options || {};
	var timeout = options.timeout || this.timeout;
	var maxReplyLineLength = options.maxReplyLineLength || this.maxReplyLineLength;
	
	var newClient = new SMTPClient(this);
	var connectPromise = new Promise(function (resolve, reject) {
		var _onError = _.bind(function (error) {
			reject(error);
		}, this);
		var socket = net.createConnection(port, host, _.bind(function () {
			socket.removeListener('error', _onError);
		}, this));
		socket.once('error', _onError);
		var replyParser = new SMTPReplyParser();
		replyParser.timeout = timeout;
		replyParser.maxLineLength = maxReplyLineLength;
		replyParser.parse(socket).then(_.bind(function (reply) {
			var client = new SMTPClient(this);
			socket.once('end', _.bind(client.onEnd, client));
			client.socket = socket;
			client.server = {greeting: reply};
			client.connect = function () {
				return connectPromise;
			};
			resolve(client);
		}, this)).catch(function (error) {
			try {
				socket.close();
			} catch (err) {
			}
			reject(error);
		});
	}, this);
	return connectPromise;
	
};

SMTPClient.prototype.command = function (command, options) {
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	options = options || {};
	var timeout = options.timeout || this.timeout;
	var maxCommandLineLength = options.maxCommandLineLength || this.maxCommandLineLength;
	var maxReplyLineLength = options.maxReplyLineLength || this.maxReplyLineLength;
	return new Promise(_.bind(function (resolve, reject) {
		var cmdParser = new SMTPCommandParser();
		cmdParser.maxLineLength = maxCommandLineLength;
		var replyParser = new SMTPReplyParser();
		replyParser.maxLineLength = maxReplyLineLength;
		replyParser.timeout = timeout;
		if (_.isString(command)) {
			try {
				command = cmdParser.parseCommandLine(command);
			} catch (error) {
				return reject(error instanceof Error ? error : new Error(error));
			}
		}
		try {
			command = cmdParser.serializeCommand(command);
		} catch (error) {
			return reject(error instanceof Error ? error : new Error(error));
		}
		replyParser.parse(this.socket).then(function (reply) {
			resolve(reply);
		}).catch(function (error) {
			reject(error);
		});
		this.socket.write(command, 'utf8');
	}, this));
};

SMTPClient.prototype.data = function (input) {
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	return new Promise(function (resolve, reject) {
		
	});
};

SMTPClient.prototype.upgrade = function (tls) {
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	return new Promise(function (resolve, reject) {
		
	});
};

SMTPClient.prototype.close = function () {
	if (this.socket) {
		this.socket.close();
		delete this.socket;
	}
};

SMTPClient.prototype.onEnd = function () {
	delete this.socket;
};
