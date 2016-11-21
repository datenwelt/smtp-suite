var _ = require('underscore');
var Promise = require('bluebird');
var stream = require('stream');
var strfmt = require('util').format;

module.exports = SMTPReplyParser;

SMTPReplyParser.prototype.constructor = SMTPReplyParser;

function SMTPReplyParser() {
	this.timeout = 300000;
	this.maxLineLength = 512;
}

SMTPReplyParser.prototype.parse = function (inputStream) {
	return new Promise(_.bind(function (resolve, reject) {
		var currentLine = Buffer.alloc(this.maxLineLength);
		var replyLines = [];
		var reply;
		var lineLength = 0;
		var _timer;
		
		var cleanup = _.bind(function (result) {
			if (_timer) {
				clearTimeout(_timer);
			}
			inputStream.removeListener('data', onData);
			inputStream.removeListener('error', onError);
			inputStream.removeListener('end', onEnd);
			result instanceof Error ? reject(result) : resolve(result);
		}, this);
		var onData = _.bind(function (chunk) {
			if (!chunk || !chunk.length) return;
			if (_.isString(chunk)) {
				chunk = chunk.toString('utf8');
			}
			if (!chunk instanceof Buffer) {
				return cleanup(new Error('Data chunk from input stream must be a string or a buffer.'));
			}
			var currChar;
			var pos = 0;
			while (pos < chunk.length) {
				if (lineLength >= this.maxLineLength) {
					return cleanup(new Error(strfmt('Number of input bytes exceeds line limit of %d octets.', this.maxLineLength)));
				}
				currChar = chunk.readUInt8(pos++);
				currentLine.writeUInt8(currChar, lineLength++);
				if (currChar == 0x0a) {
					var replyLine = currentLine.slice(0, lineLength);
					try {
						replyLine = this.parseReplyLine(replyLine);
					} catch (error) {
						return cleanup(error instanceof Error ? error : new Error(error));
					}
					replyLines.push(replyLine);
					if (replyLine.isLast) {
						if (pos != chunk.length) {
							throw new Error('Illicit overhead data after end of reply has been indicated.');
						}
						try {
							reply = this.parseReply(replyLines);
							return cleanup(reply);
						} catch (error) {
							return cleanup(error instanceof Error ? error : new Error(error));
						}
					}
					lineLength = 0;
				}
			}
		}, this);
		var onEnd = _.bind(function () {
			cleanup(new Error('Premature end of input while parsing reply.'));
		}, this);
		var onError = _.bind(function (error) {
			cleanup(error instanceof Error ? error : new Error(error));
		}, this);
		var onTimeout = _.bind(function () {
			cleanup(new Error(strfmt('Timeout parsing reply after %d seconds.', this.timeout / 1000)));
		}, this);
		if (this.timeout && this.timeout > 0) {
			_timer = setTimeout(onTimeout, this.timeout);
		}
		inputStream.on('data', onData);
		inputStream.on('error', onError);
		inputStream.on('end', onEnd);
	}, this));
};

SMTPReplyParser.prototype.parseReplyLine = function (input) {
	var replyLine = {};
	if (!input || !input.length) {
		throw new Error('Cannot parse an empty line.');
	}
	if (input.length > this.maxLineLength) {
		throw new Error(strfmt('Number of input bytes exceeds size limit of %d octets.', this.maxLineLength));
	}
	if (input instanceof Buffer) {
		input = input.toString('utf8');
	}
	input = input.trimRight();
	if (input.match(/\r\n/)) {
		throw new Error('Reply line must not contain line breaks.');
	}
	if (input.match(/[\r\n]|(?:\n\r)/)) {
		throw new Error('Reply line contains non-standard line breaks.');
	}
	var parts = /^([2345][0-9]{2})(?:([\- ])(.*))?/.exec(input);
	if (!parts) {
		throw new Error(strfmt('Invalid reply line: %s', input));
	}
	return {
		code: Number.parseInt(parts[1]),
		isLast: parts[2] !== '-',
		message: parts[3] || ''
	};
};

SMTPReplyParser.prototype.parseReply = function (input) {
	var replyLines;
	if (input instanceof Buffer) {
		input = input.toString('utf8');
	}
	if (_.isString(input)) {
		var lines = input.split(/\r\n/);
		replyLines = _.map(lines, function (line) {
			return this.parseReplyLine(line);
		}, this);
	} else if (_.isArray(input)) {
		replyLines = input;
	} else {
		throw new Error('Input to parseReply() must be a string, a buffer or an array of reply lines.');
	}
	if (!replyLines.length) {
		throw new Error('No reply lines to parse in input.');
	}
	return _.reduce(replyLines, _.bind(function (memo, replyLine, idx, list) {
		memo.code = replyLine.code;
		if (idx == 0) {
			memo.message = replyLine.message;
			memo.lines = [];
		}
		memo.lines.push(replyLine.message);
		if (replyLine.isLast && idx != list.length - 1) {
			throw new Error('Premature end of multiline reply.');
		}
		if (!replyLine.isLast && idx == list.length - 1) {
			throw new Error('Unterminated multiline reply.');
		}
		return memo;
	}, this), {});
};

SMTPReplyParser.prototype.serializeReply = function (reply) {
	if (!reply) {
		throw new Error('Cannot serialize empty input.');
	}
	if (!reply.code) {
		throw new Error('Input object needs to have a "code" property.');
	}
	if (!reply.lines || !_.isArray(reply.lines) || !reply.lines.length) {
		if (!reply.message)
			throw new Error('Input object needs to have an array as "lines" property with at least 1 line.');
	}
	if ( reply.message ) {
		reply.lines = reply.lines || [];
		reply.lines[0] = reply.message;
	}
	var output = _.chain(reply.lines).reduce(_.bind(function(memo, line, idx) {
		var currentLine = "";
		currentLine += reply.code;
		currentLine += idx == reply.lines.length-1 ? " " : "-";
		currentLine += line.trim();
		currentLine += "\r\n";
		if ( currentLine.length > this.maxLineLength ) {
			throw new Error(strfmt('Number of input bytes exceeds line limit of %d octets.', this.maxLineLength));
		}
		return memo+currentLine;
	}, this), "").value();
	return output;
};