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
var process = require('process');
var stream = require('stream');
var strfmt = require('util').format;
var tls = require('tls');


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
		maxDataLineLength: 1000,
	}, options || {});
	this.timeout = options.timeout;
	this.maxReplyLineLength = options.maxReplyLineLength;
	this.maxCommandLineLength = options.maxCommandLineLength;
	this.maxDataLineLength = options.maxDataLineLength;
	this.sending = false;
	this.needsDrain = false;
	this.secure = false;
}

SMTPClient.prototype.connect = function (host, port, options) {
	options = options || {};
	var socket;
	var tlsOpts = options.tls || false;
	var timeout = options.timeout || this.timeout;
	var maxReplyLineLength = options.maxReplyLineLength || this.maxReplyLineLength;
	
	var connectPromise = new Promise(_.bind(function (resolve, reject) {
		var _onError = _.bind(function (error) {
			reject(error);
		}, this);
		var _onConnect = _.bind(function () {
			this.secure = !!tlsOpts;
			socket.removeListener('error', _onError);
			this._onEndListener = _.bind(this.onEnd, this);
			socket.on('end', this._onEndListener);
			this._onCloseListener = _.bind(this.onClose, this);
			socket.on('close', this._onCloseListener);
			this._onTimeoutListener = _.bind(this.onTimeout, this);
			socket.on('timeout', this._onTimeoutListener);
			this._onErrorListener = _.bind(this.onError, this);
			socket.on('error', this._onErrorListener);
			this.socket = socket;
			this.connect = function () {
				return connectPromise;
			};
		}, this);
		if ( !tlsOpts ) {
			socket = net.createConnection(port, host, _onConnect);
		} else {
			socket = tls.connect(port, host, tlsOpts, _onConnect);
		}
		socket.once('error', _onError);
		var replyParser = new SMTPReplyParser();
		replyParser.timeout = timeout;
		replyParser.maxLineLength = maxReplyLineLength;
		replyParser.parse(socket)
			.then(_.bind(function (reply) {
				resolve(reply);
			}, this))
			.catch(function (error) {
				reject(error);
			});
	}, this), this);
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
					clearTimeout(_timer);
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
			_timer = setTimeout(_onTimeout, timeout);
		}
		process.nextTick(_doWrite);
	}, this));
};

SMTPClient.prototype.data = function (input, options) {
	options = options || {};
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	if (_.isString(input)) {
		input = Buffer.from(input, options.encoding || 'utf8');
		
	}
	var inputStream;
	if (input instanceof Buffer) {
		(function () {
			inputStream = new stream.Readable();
			inputStream._read = _.bind(function (size) {
				if (this.bufferPos >= this.buffer.length) {
					this.push(null);
				} else {
					var end = this.bufferPos + size > this.buffer.length ? this.buffer.length : this.bufferPos + size;
					this.push(this.buffer.slice(this.bufferPos, end));
					this.bufferPos += size;
				}
			}, inputStream);
		})();
		inputStream.bufferPos = 0;
		inputStream.buffer = input;
	} else if (data instanceof streams.Readable) {
		inputStream = data;
	} else {
		return Promise.reject(new Error('Invalid input, need buffer, string or readable stream not ' + typeof input + "."));
	}
	return new Promise(_.bind(function (resolve, reject) {
		var encoder = new SMTPDataEncoder();
		encoder.on('end', _.bind(function () {
			var replyParser = new SMTPReplyParser();
			replyParser.parse(this.socket)
				.then(function (reply) {
					resolve(reply);
				})
				.catch(function (error) {
					reject(error);
				});
		}, this));
		encoder.on('data', _.bind(function (chunk) {
			encoder.pause();
			var p = this._write(chunk, {timeout: 180000}).then(function () {
				encoder.resume();
			}).catch(function (error) {
				reject(error instanceof Error ? error : new Error(error));
			});
		}, this));
		encoder.on('error', function (error) {
			reject(error instanceof Error ? error : new Error(error));
		});
		encoder = inputStream.pipe(encoder);
	}, this));
};

SMTPClient.prototype.upgrade = function (options) {
	options = options || {};
	var timeout = options.timeout || this.timeout;
	var tlsOpts = options.tls || {};
	if (!this.socket) {
		return Promise.reject(new Error('Client is not connected.'));
	}
	tlsOpts.socket = this.socket;
	return new Promise(_.bind(function (resolve, reject) {
		var _timer;
		var _onError = _.bind(function(error) {
			if ( _timer ) clearTimeout(_timer);
			reject(error);
		});
		var _onTimeout = _.bind(function() {
			tlsSocket.removeListener('error', _onError);
			reject(new Error());
		}, this);
		var tlsSocket = tls.connect(tlsOpts, _.bind(function() {
			if ( _timer ) clearTimeout(_timer);
			tlsSocket.removeListener('error', _onError);
			_.each(['end', 'close', 'error'], function(event) {
				_.each(this.socket.listeners(event), function(listener) {
					tlsSocket.addListener(event, listener);
					this.socket.removeListener(event, listener);
				}, this);
			}, this);
			this.socket = tlsSocket;
			this.secure = true;
			resolve(tlsSocket);
		}, this));
		tlsSocket.once('error', _onError);
		if ( timeout ) {
			_timer = setTimeout(_onTimeout, timeout);
		}
	}, this));
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