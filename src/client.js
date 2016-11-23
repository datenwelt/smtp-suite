'use strict';

var _ = require('underscore');
var events = require('events');
var net = require('net');


var SMTPReplyParser = require('./parsers/reply');
var SMTPCommandParser = require('./parsers/command');

module.exports = SMTPClient;

SMTPClient.prototype = Object.create(events.EventEmitter.prototype);
SMTPClient.prototype.constructor = SMTPClient;

function SMTPClient(options) {
	events.EventEmitter.call(this);
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
			client._onEndListener = _.bind(client.onEnd, client);
			socket.on('end', client._onEndListener);
			client._onCloseListener = _.bind(client.onClose, client);
			socket.on('close', client._onCloseListener);
			client._onTimeoutListener = _.bind(client.onTimeout, client);
			socket.on('timeout', client._onTimeoutListener);
			client._onErrorListener = _.bind(client.onError, client);
			socket.on('error', client._onErrorListener);
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
		var _write = _.bind(function(command){
			if ( !this.socket.write(command, 'utf8') ) {
				this.socket.once('drain', _write);
			}
		}, this, command);
		process.nextTick(_write);
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
		this.socket.end();
		delete this.socket;
	}
};

SMTPClient.prototype.onError = function(error) {
	this.emit('error');
};

SMTPClient.prototype.onEnd = function () {
	this.emit('end');
	this._cleanup();
};

SMTPClient.prototype.onClose = function (hadError) {
	this.emit('close', hadError);
	this._cleanup();
};

SMTPClient.prototype.onTimeout = function() {
	this.emit('error', new Error('Timeout waiting on network data.'));
	this._cleanup();
};

SMTPClient.prototype._cleanup = function() {
	if ( this._onErrorListener) this.removeListener('end', this._onErrorListener);
	if ( this._onEndListener) this.removeListener('end', this._onEndListener);
	if ( this._onCloseListener) this.removeListener('close', this._onCloseListener);
	if ( this._onTimeoutListener) this.removeListener('timeout', this._onTimeoutListener);
	delete this._onErrorListener;
	delete this._onEndListener;
	delete this._onCloseListener;
	delete this._onTimeoutListener;
	delete this.socket;
};