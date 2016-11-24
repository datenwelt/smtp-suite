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

var _ = require('underscore');
var Promise = require('bluebird');

var strfmt = require('util').format;

module.exports = SMTPCmdLineParser;

SMTPCmdLineParser.prototype.constructor = SMTPCmdLineParser;

function SMTPCmdLineParser() {
	
	this.maxLineLength = 512;
	
	this.timeout = 300000;
	
}

SMTPCmdLineParser.prototype.parse = function (inputStream) {
	return new Promise(_.bind(function (resolve, reject) {
		var buffer = Buffer.alloc(this.maxLineLength);
		var bufferSize = 0;
		var _timer;
		
		var onData = _.bind(function (chunk) {
			if (!chunk || !chunk.length) {
				return;
			}
			if (_.isString(chunk)) {
				chunk = Buffer.from(chunk, 'utf8');
			}
			if (!chunk instanceof Buffer) {
				return cleanup(new Error('Input stream should provide data chunks as strings or buffers.'));
			}
			if (bufferSize + chunk.length > this.maxLineLength) {
				return cleanup(new Error(strfmt('Number of input bytes exceeds size limit of %d octets.', this.maxLineLength)));
			}
			var lastChar = bufferSize ? buffer.readUInt8(bufferSize - 1) : 0x0;
			var currChar = 0x0;
			bufferSize += chunk.copy(buffer, bufferSize);
			var pos = 0;
			while (pos < chunk.length && currChar != 0x0a) {
				currChar = chunk.readUInt8(pos++);
				if ((lastChar == 0x0d && currChar != 0x0a)
					|| (lastChar != 0x0d && currChar == 0x0a)) {
					return cleanup(new Error("Input stream contains unsupported line break."));
				}
				lastChar = currChar;
			}
			if (currChar == 0x0a) {
				if (pos != chunk.length) {
					return cleanup(new Error('Input stream provided additional octets after CRLF line break.'));
				}
				var line = buffer.toString('utf8', 0, bufferSize - 2);
				try {
					var command = this.parseCommandLine(line);
					cleanup(command);
				} catch (error) {
					cleanup(error instanceof Error ? error : new Error(error));
				}
			}
		}, this);
		var onError = _.bind(function (error) {
			cleanup(error instanceof Error ? error : new Error(error));
		}, this);
		var onEnd = _.bind(function () {
			cleanup(new Error('Premature end of input stream while parsing SMTP command.'));
		}, this);
		var onTimeout = _.bind(function () {
			cleanup(new Error(strfmt('Timeout after waiting on SMTP command for more than %d seconds.', this.timeout / 1000)));
		}, this);
		var cleanup = _.bind(function (result) {
			inputStream.removeListener('data', onData);
			if (result instanceof Error) {
				reject(result);
			} else {
				resolve(result);
			}
			_timer && clearTimeout(_timer);
		}, this);
		inputStream.on('data', onData);
		inputStream.once('error', onError);
		inputStream.once('end', onEnd);
		
		if (this.timeout && this.timeout > 0) {
			_timer = setTimeout(onTimeout, this.timeout);
		}
		
	}, this));
};

SMTPCmdLineParser.prototype.parseCommandLine = function (line) {
	var verb, params;
	if (!line) {
		throw new Error('Unable to parse empty command line.');
	}
	if (line instanceof Buffer) {
		line = line.toString('utf8');
	} else if (!_.isString(line)) {
		throw new Error('Input must be string or buffer, but not ' + typeof line);
	}
	line = line.trim();
	if (line.length > this.maxLineLength - 2) {
		throw new Error(strfmt('Command line exceeds size limit of %d octets.', this.maxLineLength));
	}
	if (line.match(/[\r\n]/)) {
		throw new Error('Command lines cannot contain line breaks.');
	}
	var parts = line.split(/\s+/);
	var command = {
		verb: _.first(parts)
	};
	parts = _.rest(parts);
	switch (command.verb) {
		case 'EHLO':
			if (!parts.length) {
				throw new Error('EHLO command without domain or address literal.');
			}
			command.domain = _.first(parts);
			parts = _.rest(parts);
			break;
			break;
		case 'MAIL':
			if (!parts.length) {
				throw new Error('MAIL command without return path (FROM:<...>).');
			}
			command.returnPath = _.first(parts);
			matches = /FROM:(\S+)/.exec(command.returnPath);
			if (!matches || !matches.length) {
				throw new Error('MAIL missing valid return path argument (FROM:<...>).');
			}
			command.returnPath = matches[1];
			if (command.returnPath.startsWith("<")) {
				if (!command.returnPath.endsWith(">")) {
					throw new Error('MAIL missing valid return path argument (FROM:<...>).');
				}
				command.returnPath = command.returnPath.substr(1, command.returnPath.length - 2);
			}
			parts = _.rest(parts);
			break;
		case 'RCPT':
			if (!parts.length) {
				throw new Error('RCPT command without forward path (TO:<...>).');
			}
			command.forwardPath = _.first(parts);
			matches = /TO:(\S+)/.exec(command.forwardPath);
			if (!matches || !matches.length) {
				throw new Error('RCPT missing valid forward path argument (TO:<...>).');
			}
			command.forwardPath = matches[1];
			if (command.forwardPath.startsWith("<")) {
				if (!command.forwardPath.endsWith(">")) {
					throw new Error('RCPT missing valid forward path argument (TO:<...>).');
				}
				command.forwardPath = command.forwardPath.substr(1, command.forwardPath.length - 2);
			}
			if (!command.forwardPath) {
				throw new Error('RCPT with empty forward path argument (TO:<...>).');
			}
			parts = _.rest(parts);
			break;
	}
	params = [];
	var param = {};
	while (parts.length) {
		var part = _.first(parts);
		var matches = /([^=]*)(?:=(.+))?/.exec(part);
		if (!matches || matches.length <= 2 || !matches[2]) {
			param = {};
			param[part] = true;
			params.push(param);
		} else {
			param = {};
			param[matches[1]] = matches[2];
			params.push(param)
		}
		parts = _.rest(parts);
	}
	command.params = params;
	return command;
	
};

SMTPCmdLineParser.prototype.assertCommandLine = function (input, options) {
	options = options || {};
	var encoding = options.encoding || 'uft8';
	var maxLineLength = options.maxLineLength || this.maxLineLength;
	var command = input;
	if (command instanceof Buffer) {
		command = Buffer.toString(command, encoding);
	}
	if (_.isString(command)) {
		command = command.trim();
		if (command.match(/[\r\n]/)) {
			throw new Error("Command lines cannot contain line breaks.");
		}
		command += "\r\n";
		if (Buffer.byteLength(command, encoding) > maxLineLength) {
			throw new Error(strfmt('Command line exceeds maximum line length of %d octets.', maxLineLength));
		}
		return command;
	}
	throw new Error('Input must be string or buffer not ' + typeof input);
};

SMTPCmdLineParser.prototype.serializeCommand = function (command) {
	if (!command) {
		return "NOOP\r\n";
	}
	if (!command.verb) {
		throw new Error('Need an object with at least a property "verb" to construct a command line. { verb: ...}.');
	}
	var commandLine = "";
	commandLine += command.verb;
	switch (command.verb) {
		case 'EHLO':
			if (!command.domain) {
				throw new Error('EHLO command needs a "domain" property with the domain or an address literal of the client. { verb: "EHLO", domain: "..."}');
			}
			commandLine += " " + command.domain;
			break;
		case 'MAIL':
			commandLine += " FROM:<" + (command.returnPath || "") + ">";
			break;
		case 'RCPT':
			if (!command.forwardPath) {
				throw new Error('RCPT command needs a "forwardPath" property with the address of the recipient. { verb: "EHLO", forwardPath: "...@..."}');
			}
			commandLine += " TO:<" + command.forwardPath + ">";
			break;
	}
	if (command.params) {
		if (!_.isArray(command.params)) {
			throw new Error('{ params: [] } needs to be an array of objects.');
		}
		_.each(command.params, function (param) {
			if (!_.isObject(param)) {
				commandLine += " " + param;
			} else {
				commandLine += _.chain(param).keys().reduce(function (memo, key) {
					if (!param[key] || param[key] === true) {
						return memo + " " + key;
					} else {
						return memo + " " + key + "=" + param[key];
					}
				}, "");
			}
		});
	}
	commandLine = commandLine.trim() + "\r\n";
	if (commandLine.length > this.maxLineLength)
		throw new Error(strfmt('Serialized SMTP command exceeds maximum line length of %d octets.', this.maxLineLength));
	return commandLine;
};
