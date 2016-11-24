// Copyright 2016 Jan Obladen
//
//  Licensed under the Apache License, Version 2.0 (the "License");
//  you may not use this file except in compliance with the License.
//  You may obtain a copy of the License at
//
//  http://www.apache.org/licenses/LICENSE-2.0
//
//  Unless required by applicable law or agreed to in writing, software
//  distributed under the License is distributed on an "AS IS" BASIS,
//  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//  See the License for the specific language governing permissions and
//  limitations under the License.
//
'use strict';

var _ = require('underscore');
var events = require('events');
var net = require('net');
var strfmt = require('util').format;


var SMTPReplyParser = require('./parsers/reply');
var SMTPCommandParser = require('./parsers/command');
var SMTPDataEncoder = require('./parsers/data').DotEncoder;

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
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
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

SMTPClient.prototype.data = function (input, options) {
	options = options || {};
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	if ( _.isString(input) ) {
		input = Buffer.from(input, options.encoding || 'utf8');
		
	}
	var inputStream;
	if ( input instanceof Buffer ) {
		inputStream = new stream.Readable({
			read: _.bind(function(size) {
				if ( this.bufferPos >= this.byteLength ) {
					this.push(null);
				} else {
					var end = this.bufferPos + size > this.buffer.length ? this.bufferPos + size : this.buffer.length;
					this.push(this.buffer.slice(bufferPos, end));
					this.bufferPos += size;
				}
			}, inputStream)
		});
		inputStream.bufferPos = 0;
		inputStream.buffer = input;
	} else if (	data instanceof streams.Readable) {
		inputStream = data;
	} else {
		return Promise.reject(new Error('Invalid input, need buffer, string or readable stream not ' + typeof input + "."));
	}
	return new Promise(_.bind(function (resolve, reject) {
		var encoder = new SMTPDataEncoder();
		encoder.on('end', function() {
			resolve();
		});
		encoder.on('data', function(chunk) {
			encoder.pause();
			this._write(chunk, { timeout: 180000 }).then(function() {
				encoder.unpause();
			}).catch(function(error) {
				reject(error instanceof Error ? error : new Error(error));
			});
		});
		encoder.on('error', function(error) {
			reject(error instanceof Error ? error : new Error(error));
		});
		encoder = inputStream.pipe(encoder);
	}, this));
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