var _ = require('underscore');
var stream = require('stream');
var strfmt = require('util').format;

module.exports.DotEncoder = DotEncoder;
module.exports.DotDecoder = DotDecoder;

var CR = 0x0d;
var LF = 0x0a;
var DOT = 0x2e;


DotEncoder.prototype = Object.create(stream.Transform.prototype);
DotEncoder.prototype.constructor = DotEncoder;

function DotEncoder(options) {
	stream.Transform.call(this, options);
	this.buffer = Buffer.alloc(1024, 0x00);
	this.bufferSize = 0;
	this.lastChar = 0x00;
}

DotEncoder.prototype._transform = function (chunk, encoding, callback) {
	if (encoding !== 'buffer') {
		chunk = Buffer.from(chunk, encoding);
	}
	var chunkPos = 0;
	var currentChar;
	var write2Buffer = _.bind(function (c) {
		this.buffer.writeUInt8(c, this.bufferSize++);
		this.lastChar = c;
		if (this.bufferSize == this.buffer.length) {
			this.push(this.buffer);
			this.bufferSize = 0;
		}
	}, this);
	while (chunkPos < chunk.length) {
		currentChar = chunk.readUInt8(chunkPos);
		// Convert "dot" characters to double "dots" at line beginning.
		if (this.lastChar == 0x00 || this.lastChar == LF) {
			if (currentChar == DOT) {
				write2Buffer(DOT);
			}
		}
		// Convert bare CR and LF into CRLF.
		if (currentChar != LF && this.lastChar == CR) {
			write2Buffer(LF);
			continue;
		}
		if (currentChar == LF && this.lastChar != CR) {
			write2Buffer(CR);
		}
		write2Buffer(currentChar);
		chunkPos++;
	}
	callback();
};

DotEncoder.prototype._flush = function (callback) {
	this.push(this.buffer.slice(0, this.bufferSize));
	if (this.lastChar == CR) {
		// Append an LF if there is a bare CR at the end of the input.
		this.push(Buffer.from([LF]));
		this.lastChar = LF;
	} else if (this.lastChar != LF) {
		// Append a CRLF if the input does not end with a newline.
		this.push(Buffer.from([CR, LF]));
		this.lastChar = LF;
	}
	// Append final DOT + newline to finish the input.
	this.push(Buffer.from([DOT, CR, LF]));
	callback();
};

DotDecoder.prototype = Object.create(stream.Transform.prototype);
DotDecoder.prototype.constructor = DotDecoder;

function DotDecoder(options) {
	stream.Transform.call(this, options);
	this.maxLineLength = 1000;
	this.buffer = Buffer.alloc(this.maxLineLength, 0x0);
	this.bufferSize = 0;
}

DotDecoder.prototype._transform = function (chunk, encoding, callback) {
	if (encoding !== 'buffer') {
		chunk = Buffer.from(chunk, encoding);
	}
	var pos = 0;
	var lastChar = this.buffer.length ? this.buffer.readUInt8(this.buffer.length - 1) : 0x00;
	while (pos < chunk.length) {
		if (this.bufferSize > this.maxLineLength) {
			throw new Error(strfmt('Input exceeds maximum line length of %d octets.', this.maxLineLength));
		}
		var currChar = chunk.readUInt8(pos++);
		this.buffer.writeUInt8(currChar, this.bufferSize++);
		if (lastChar == CR && currChar == LF) {
			if (this.bufferSize > 0 && this.buffer.readUInt8(0) == DOT) {
				if (this.bufferSize == 3) {
					this.bufferSize = -1;
					this.push(null);
					return;
				}
				this.push(this.buffer.slice(1, this.bufferSize));
			} else {
				this.push(this.buffer.slice(0, this.bufferSize));
			}
			this.bufferSize = 0;
		}
		lastChar = currChar;
	}
	callback();
};

DotDecoder.prototype._flush = function (callback) {
	callback();
};

function _write2Buffer(buffer, c) {
	
}
