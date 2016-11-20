var expect = require("chai").expect;
var events = require('events');
var os = require('os');
var stream = require('stream');
var strfmt = require('util').format;
var _ = require('underscore');

var SMTPReplyParser = require('../../src/parsers/reply');

describe('SMTP Reply Parser', function () {
	
	describe('Constructor', function () {
		
		it('returns a SMTPReplyParser instance', function () {
			var parser = new SMTPReplyParser();
			expect(parser).to.be.an.instanceOf(SMTPReplyParser);
		});
		
	});
	
	describe('Line Parser', function () {
		
		it('returns an object when parsing valid single line replies.', function () {
			var parser = new SMTPReplyParser();
			var replyLine = parser.parseReplyLine('250 OK');
			expect(replyLine).to.be.eql({code: 250, isLast: true, message: 'OK'});
		});
		
		it('returns an object when parsing valid elements of multi line replies.', function () {
			var parser = new SMTPReplyParser();
			var replyLine = parser.parseReplyLine('250-OK');
			expect(replyLine).to.be.eql({code: 250, isLast: false, message: 'OK'});
		});
		
		it('returns an object when parsing reply lines without a message.', function () {
			var parser = new SMTPReplyParser();
			var replyLine = parser.parseReplyLine('250');
			expect(replyLine).to.be.eql({code: 250, isLast: true, message: ''});
		});
		
		it('throws an error when parsing an empty line.', function () {
			var parser = new SMTPReplyParser();
			expect(function () {
				parser.parseReplyLine('');
			}).to.throw('Cannot parse an empty line.');
		});
		
		it('throws an error when parsing oversized lines.', function () {
			var parser = new SMTPReplyParser();
			var line = Buffer.alloc(parser.maxLineLength + 1, 97).toString('utf8');
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Number of input bytes exceeds size limit of 512 octets.');
		});
		
		it('throws an error when parsing oversized lines.', function () {
			var parser = new SMTPReplyParser();
			var line = Buffer.alloc(parser.maxLineLength + 1, 97).toString('utf8');
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Number of input bytes exceeds size limit of 512 octets.');
		});
		
		it('throws an error when input contains line breaks.', function () {
			var parser = new SMTPReplyParser();
			var line = "250-OK\n250 OK";
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Reply line contains non-standard line breaks.');
		});
		
		it('throws an error when input does not start with a number.', function () {
			var parser = new SMTPReplyParser();
			var line = "OK";
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Invalid reply line: OK');
		});
		
		it('throws an error when input does not start with a valid SMTP reply code.', function () {
			var parser = new SMTPReplyParser();
			var line = "677 OK";
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Invalid reply line: ' + line);
		});
		
		it('throws an error when input contains a valid reply code but next character is no - or space.', function () {
			var parser = new SMTPReplyParser();
			var line = "677.OK";
			expect(function () {
				parser.parseReplyLine(line);
			}).to.throw('Invalid reply line: ' + line);
		});
		
	});
	
	describe('Synchronous API', function () {
		
		var parser;
		beforeEach(function () {
			parser = new SMTPReplyParser();
		});
		
		it('returns an object when parsing valid replies from string.', function () {
			var input = "250 OK";
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'OK', lines: ['OK']});
			
		});
		
		it('returns an object when parsing valid replies from multiline string.', function () {
			var input = "250-baleen-mx.io\r\n250 STARTTLS";
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'baleen-mx.io', lines: ['baleen-mx.io', 'STARTTLS']});
		});
		
		it('returns an object when parsing valid replies from buffers.', function () {
			var input = Buffer.from("250 OK");
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'OK', lines: ['OK']});
			
		});
		
		it('returns an object when parsing valid replies from multiline buffers.', function () {
			var input = Buffer.from("250-baleen-mx.io\r\n250 STARTTLS");
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'baleen-mx.io', lines: ['baleen-mx.io', 'STARTTLS']});
		});
		
		it('returns an object when parsing valid replies from reply line arrays.', function () {
			var input = [{code: 250, message: 'OK', isLast: true}];
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'OK', lines: ['OK']});
			
		});
		
		it('returns an object when parsing valid multiline replies from reply line arrays buffers.', function () {
			var input = [
				{code: 250, message: 'baleen-mx.io', isLast: false},
				{code: 250, message: 'STARTTLS', isLast: true}
			];
			var reply = parser.parseReply(input);
			expect(reply).to.eql({code: 250, message: 'baleen-mx.io', lines: ['baleen-mx.io', 'STARTTLS']});
		});
		
		it('calls parseReplyLine() for every input line.', function (done) {
			var input = "250-OK\r\n250 OK";
			var _orig = parser.parseReplyLine;
			var count = 0;
			parser.parseReplyLine = function (input) {
				count++;
				if (count == 2) {
					done();
				}
				return _orig(input);
			};
			var reply = parser.parseReply(input);
		});
		
		it('throws an error if reply contains invalid line breaks.', function () {
			var input = "250-OK\r250 OK";
			expect(function () {
				parser.parseReply(input);
			}).to.throw('Reply line contains non-standard line breaks.');
		});
		
		it('throws an error if reply lines are in invalid order.', function () {
			var input = "250 OK\r\n250-OK";
			expect(function () {
				parser.parseReply(input);
			}).to.throw('Premature end of multiline reply.');
		});
		
		it('throws an error if reply lines are in invalid order.', function () {
			var input = "250-OK\r\n250-OK\r\n250-OK";
			expect(function () {
				parser.parseReply(input);
			}).to.throw('Unterminated multiline reply.');
		});
		
	});
	
	describe('Stream API', function () {
		
		var parser;
		var inputStream;
		
		beforeEach(function () {
			parser = new SMTPReplyParser();
			inputStream = new stream.Readable();
			inputStream._read = function () {
			};
		});
		
		it('parses SMTP single line replies from input stream', function (done) {
			parser.parse(inputStream)
				.then(function (reply) {
					expect(reply).to.eql({code: 250, message: 'OK', lines: ['OK']})
					done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.push("250 OK\r\n");
			inputStream.push(null);
		});
		
		it('parses SMTP multi line replies from input stream', function (done) {
			parser.parse(inputStream)
				.then(function (reply) {
					expect(reply).to.eql({code: 250, message: 'BEGIN', lines: ['BEGIN', 'END']});
					done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.push("250-BEGIN\r\n250 END\r\n");
			inputStream.push(null);
		});
		
		it('parses SMTP multi line replies from input stream', function (done) {
			parser.parse(inputStream)
				.then(function (reply) {
					expect(reply).to.eql({code: 250, message: 'BEGIN', lines: ['BEGIN', 'END']});
					done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.push("250-BEGIN\r\n250 END\r\n");
			inputStream.push(null);
		});
		
		it('calls parseReplyLine() for each line in the reply.', function (done) {
			var _orig = parser.parseReplyLine;
			var lineCount = 0;
			var lines = ["250-BEGIN\r\n", "250 END\r\n"];
			parser.parseReplyLine = function (input) {
				if (lineCount > 2) {
					done(new Error('parseReplyLine() called too often.'));
				}
				if (lineCount != -1) {
					input = input.toString();
					try {
						expect(input).to.equal(lines[lineCount++]);
					} catch (error) {
						lineCount = -1;
						done(error);
					}
				}
				return _orig.apply(parser, arguments);
			};
			parser.parse(inputStream)
				.then(function (reply) {
					if (lineCount != -1)
						done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.push("250-BEGIN\r\n250 END\r\n");
			inputStream.push(null);
		});
		
		it('calls parseReply() once.', function (done) {
			var _orig = parser.parseReply;
			var callCount = 0;
			var expected = [{code: 250, isLast: false, message: 'BEGIN'}, {code: 250, isLast: true, message: 'END'}];
			parser.parseReply = function (input) {
				if (callCount > 0) {
					done(new Error('parseReply() called too often.'));
				}
				try {
					expect(input).to.eql(expected);
					callCount++;
				} catch (error) {
					done(error);
				}
				return _orig.apply(parser, arguments);
			};
			parser.parse(inputStream)
				.then(function (reply) {
					if (callCount == 1)
						done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.push("250-BEGIN\r\n250 END\r\n");
			inputStream.push(null);
		});
		
		it('rejects the promise with an error if stream ends before end of line.', function (done) {
			parser.parse(inputStream).then(function () {
				done(new Error('Test succeeded unexpectedly.'));
			}).catch(function (error) {
				try {
					expect(error).to.be.an.instanceOf(Error);
					expect(error.message).to.equal('Premature end of input while parsing reply.');
					done();
				} catch (err) {
					done(err);
				}
			});
			inputStream.push("250-BEGIN");
			inputStream.push(null);
		});
		
		it('rejects the promise with an error if input stream times out', function (done) {
			parser.timeout = 500;
			parser.parse(inputStream).then(function () {
				done(new Error('Test succeeded unexpectedly.'));
			}).catch(function (error) {
				try {
					clearTimeout(_timer);
					expect(error).to.be.an.instanceOf(Error);
					expect(error.message).to.equal('Timeout parsing reply after 0.5 seconds.');
					done();
				} catch (err) {
					done(err);
				}
			});
			var _timer = setTimeout(function () {
				inputStream.push("250-BEGIN\r\n");
				inputStream.push(null);
			}, 1000);
		});
		
	});
	
	describe('Serializing', function () {
		
		var parser;
		beforeEach(function () {
			parser = new SMTPReplyParser();
		});
		
		it('empty input results in an error', function () {
			expect(function () {
				parser.serializeReply(null);
			}).to.throw('Cannot serialize empty input.');
		});
		
		it('too big lines result in an error', function () {
			parser.maxLineLength=3;
			expect(function () {
				parser.serializeReply({ code: 250, message: 'TOOLONG'});
			}).to.throw('Number of input bytes exceeds line limit of 3 octets.');
		});
		
		it('missing "code" property results in an error', function () {
			expect(function () {
				parser.serializeReply({});
			}).to.throw('Input object needs to have a "code" property.');
		});
		
		it('missing "lines" without "message" property results in an error', function () {
			expect(function () {
				parser.serializeReply({code: 250});
			}).to.throw('Input object needs to have an array as "lines" property with at least 1 line.');
		});
		
		it('missing "message" with "lines" property results in an valid reply object', function () {
			var reply = parser.serializeReply({code: 250, lines: ['OK']});
			var expected = "250 OK\r\n";
			expect(reply).to.eql(expected);
		});
		
		it('missing "lines" property with existing "message" property results in an valid reply object', function () {
			var reply = parser.serializeReply({code: 250, message: 'OK'});
			var expected = "250 OK\r\n";
			expect(reply).to.eql(expected);
		});
		
		it('missing "message" property overwrites first line', function () {
			var reply = parser.serializeReply({code: 250, message: 'BEGIN', lines: ['ERROR', 'END']});
			var expected = "250-BEGIN\r\n250 END\r\n";
			expect(reply).to.eql(expected);
		});
		
		it('can serialize valid single line replies', function() {
			var reply = parser.serializeReply({code: 250, message: 'BEGIN', lines: ['BEGIN']});
			var expected = "250 BEGIN\r\n";
			expect(reply).to.eql(expected);
		});
		
		it('can serialize valid multi line replies', function() {
			var reply = parser.serializeReply({code: 250, message: 'BEGIN', lines: ['BEGIN', 'END']});
			var expected = "250-BEGIN\r\n250 END\r\n";
			expect(reply).to.eql(expected);
		});
		
		it('trims whitespace in reply lines', function() {
			var reply = parser.serializeReply({code: 250, message: 'BEGIN', lines: ["BEGIN    \r\n", "END\r\n"]});
			var expected = "250-BEGIN\r\n250 END\r\n";
			expect(reply).to.eql(expected);
		});
		
	});
	
});