'use strict';

var _ = require('underscore');
var events = require('events');
var net = require('net');
var strfmt = require('util').format;


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
	this.sending = false;
	this.needsDrain = false;
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
		this._write(Buffer.from(command, 'utf8'));
	}, this));
};

SMTPClient.prototype._write = function (data, options) {
	options = options || {};
	var timeout = options.timeout;
	if (!data instanceof Buffer) {
		return Promise.reject(new Error('Invalid input data - must be a buffer not ' + typeof data));
	}
	if (this.needsDrain || this.sending) {
		return Promise.reject(new Error(strfmt('Unable to send data to the server: Client is not in sending state: %j', {
			sending: this.sending,
			needsDrain: this.needsDrain
		})));
	}
	return new Promise(_.bind(function (resolve, reject) {
		var _timer;
		var _onTimeout = _.bind(function () {
			reject(new Error(strfmt('Unable to send data to the server within timeout of %d seconds.', timeout / 1000)));
		}, this);
		var _doWrite = _.bind(function (data) {
			this.needsDrain = !this.socket.write(data, 'utf8', _.bind(function (err) {
				this.sending = false;
				if (_timer) {
					process.clearTimeout(_timer);
				}
				if (err) {
					reject(err instanceof Error ? err : new Error(err));
				} else {
					resolve(data);
				}
			}, this));
			if (this.needsDrain) {
				this.socket.once('drain', _.bind(function () {
					this.needsDrain = false;
				}, this));
			}
		}, this, data);
		if (timeout) {
			_timer = process.setTimeout(_onTimeout);
		}
		process.nextTick(_doWrite);
	}, this));
};

SMTPClient.prototype.sendLine = function (data, options) {
	options = options || {};
	var timeout = options.timeout || this.timeout;
	var maxLineLength = options.maxLineLength || this.maxCommandLineLength;
	if (_.isString(data)) {
		data = Buffer.from(data, options.encoding || 'utf8');
		delete options.encoding;
	} else if (!data instanceof Buffer) {
		return Promise.reject(new Error('Invalid input data - must be a string or buffer not ' + typeof data));
	}
	var start = 0;
	var currChar;
	while (start < data.length) {
		currChar = data.readUInt8(start);
		if ((currChar >= 9 && currChar <= 13) || currChar == 32) start++;
		else break;
	}
	var end = data.length - 1;
	while (end >= start) {
		currChar = data.readUInt8(end);
		if ((currChar >= 9 && currChar <= 13) || currChar == 32) start++;
		else break;
	}
	if (start == end) {
		return Promise.reject(new Error('Command line is whitespace only or empty.'));
	}
	var pos = start;
	while (pos <= end) {
		currChar = data.readUInt8(pos++);
		if (currChar == 10 || currChar == 13) {
			return Promise.reject(new Error("Command lines cannot contain line breaks."));
		}
	}
	var outBufferSize = end - start + 2;
	if (outBufferSize > outBufferSize) {
		return Promise.reject(new Error(strfmt("Command line exceeds size limit of %d octets.", maxLineLength)));
	}
	var outBuffer = Buffer.alloc(outBufferSize);
	data.copy(outBuffer, 0, start, end + 1);
	outBuffer.writeUInt8(outBufferSize - 2, 13);
	outBuffer.writeUInt8(outBufferSize - 1, 10);
	return this._write(outBuffer, options);
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

SMTPClient.prototype.onError = function (error) {
	this.sending = false;
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

SMTPClient.prototype.onTimeout = function () {
	this.emit('error', new Error('Timeout waiting on network data.'));
	this._cleanup();
};

SMTPClient.prototype._cleanup = function () {
	if (this._onErrorListener) this.removeListener('end', this._onErrorListener);
	if (this._onEndListener) this.removeListener('end', this._onEndListener);
	if (this._onCloseListener) this.removeListener('close', this._onCloseListener);
	if (this._onTimeoutListener) this.removeListener('timeout', this._onTimeoutListener);
	delete this._onErrorListener;
	delete this._onEndListener;
	delete this._onCloseListener;
	delete this._onTimeoutListener;
	delete this.socket;
};