var expect = require("chai").expect;
var events = require('events');
var os = require('os');
var stream = require('stream');
var strfmt = require('util').format;
var _ = require('underscore');

var SMTPCommandLineParser = require('../../src/parsers/command');

describe("SMTP Command Line Parser", function () {
	
	describe('Constructor', function () {
		it('Constructor returns a SMTPCommandLineParser instance.', function () {
			var parser = new SMTPCommandLineParser({utf8: true});
			expect(parser).to.be.instanceOf(SMTPCommandLineParser);
		});
	});
	
	describe('parses command lines to SMTP commands', function () {
		
		it('throws error on empty command lines.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('');
			}).to.throw('Unable to parse empty command line.');
		});
		
		it('throws error on command lines that exceed allowed default line length.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				var longline = Buffer.alloc(511, 97).toString('utf8');
				parser.parseCommandLine(longline);
			}).to.throw('Command line exceeds size limit of 512 octets.');
		});
		
		it('throws error on command lines that exceed an non-default line length.', function () {
			var parser = new SMTPCommandLineParser();
			parser.maxLineLength = 1024;
			expect(function () {
				var longline = Buffer.alloc(1023, 97).toString('utf8');
				parser.parseCommandLine(longline);
			}).to.throw('Command line exceeds size limit of 1024 octets.');
		});
		
		it('skips trailing whitespace', function () {
			var parser = new SMTPCommandLineParser();
			var cmd = parser.parseCommandLine('HELO     ');
			expect(cmd.verb).to.exist;
			expect(cmd.verb).to.be.equal('HELO');
		});
		
		it('skips trailing whitespace including CRLF', function () {
			var parser = new SMTPCommandLineParser();
			var cmd = parser.parseCommandLine("HELO     \r\n");
			expect(cmd.verb).to.exist;
			expect(cmd.verb).to.be.equal('HELO');
		});
		
		it('standard EHLO command', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('EHLO baleen.io');
			expect(command.verb).to.be.equal('EHLO');
			expect(command.domain).to.be.equal('baleen.io');
		});
		
		it('standard MAIL command', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('MAIL FROM:<test@baleen.io>');
			expect(command.verb).to.be.equal('MAIL');
			expect(command.returnPath).to.be.equal('test@baleen.io');
		});
		it('standard MAIL command with parameters', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('MAIL FROM:<test@baleen.io> SIZE=1000000 TESTPARAM');
			expect(command.verb).to.be.equal('MAIL');
			expect(command.returnPath).to.be.equal('test@baleen.io');
			expect(command.params).to.be.an('array');
			expect(command.params[0]).to.be.eql({SIZE: '1000000'});
			expect(command.params[1]).to.be.eql({TESTPARAM: true});
		});
		it('MAIL command where return path argument has missing brackets still ok.', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('MAIL FROM:test@baleen.io');
			expect(command.verb).to.be.equal('MAIL');
			expect(command.returnPath).to.be.equal('test@baleen.io');
		});
		it('MAIL command with empty return path argument ok.', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('MAIL FROM:<>');
			expect(command.verb).to.be.equal('MAIL');
			expect(command.returnPath).to.exist;
			expect(command.returnPath).to.be.equal('');
		});
		it('MAIL command throws an error when return path argument is omitted.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('MAIL');
			}).to.throw(Error);
		});
		it('MAIL command throws an error when return path argument is invalid.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('MAIL SIZE=100000');
			}).to.throw(Error);
		});
		it('standard RCPT command', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('RCPT TO:<test@baleen.io>');
			expect(command.verb).to.be.equal('RCPT');
			expect(command.forwardPath).to.be.equal('test@baleen.io');
		});
		it('RCPT command where forward path argument has missing brackets still ok.', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('RCPT TO:test@baleen.io');
			expect(command.verb).to.be.equal('RCPT');
			expect(command.forwardPath).to.be.equal('test@baleen.io');
		});
		it('RCPT command with empty forward path argument throws an error.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('RCPT TO:<>');
			}).to.throw(Error);
		});
		it('RCPT command throws an error when forward path argument is omitted.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('RCPT');
			}).to.throw(Error);
		});
		it('RCPT command throws an error when forward path argument is invalid.', function () {
			var parser = new SMTPCommandLineParser();
			expect(function () {
				parser.parseCommandLine('RCPT SIZE=100000');
			}).to.throw(Error);
		});
		it('standard RCPT command with parameters', function () {
			var parser = new SMTPCommandLineParser();
			var command = parser.parseCommandLine('RCPT TO:<test@baleen.io> SIZE=1000000 TESTPARAM');
			expect(command.verb).to.be.equal('RCPT');
			expect(command.forwardPath).to.be.equal('test@baleen.io');
			expect(command.params).to.be.an('array');
			expect(command.params[0]).to.be.eql({SIZE: '1000000'});
			expect(command.params[1]).to.be.eql({TESTPARAM: true});
		});
	});
	
	describe('constructs valid SMTP commands from parsing results.', function () {
		it('empty input results in NOOP.', function () {
			var cmdLine = SMTPCommandLineParser.serializeCommand();
			expect(cmdLine).to.be.equal("NOOP\r\n");
		});
		it('empty verb throws an error.', function () {
			expect(function () {
				SMTPCommandLineParser.serializeCommand({});
			}).to.throw(Error);
		});
		it('verb only commands', function () {
			expect(SMTPCommandLineParser.serializeCommand({verb: 'NOOP'})).to.be.equal("NOOP\r\n");
			expect(SMTPCommandLineParser.serializeCommand({verb: 'QUIT'})).to.be.equal("QUIT\r\n");
			expect(SMTPCommandLineParser.serializeCommand({verb: 'RSET'})).to.be.equal("RSET\r\n");
		});
		it('EHLO command with domain.', function () {
			expect(SMTPCommandLineParser.serializeCommand({
				verb: 'EHLO',
				domain: 'baleen.io'
			})).to.be.equal("EHLO baleen.io\r\n");
		});
		it('EHLO command without domain throws an error.', function () {
			expect(function () {
				SMTPCommandLineParser.serializeCommand({verb: 'EHLO'});
			}).to.throw(Error);
		});
		it('MAIL command accepted without a return path.', function () {
			expect(SMTPCommandLineParser.serializeCommand({verb: 'MAIL'})).to.be.equal("MAIL FROM:<>\r\n");
		});
		it('MAIL command with return path.', function () {
			expect(SMTPCommandLineParser.serializeCommand({
				verb: 'MAIL',
				returnPath: 'test@baleen.io'
			})).to.be.equal("MAIL FROM:<test@baleen.io>\r\n");
		});
		it('MAIL command with return path and params.', function () {
			expect(SMTPCommandLineParser.serializeCommand({
				verb: 'MAIL',
				returnPath: 'test@baleen.io',
				params: [
					{SIZE: 100000}
				]
			})).to.be.equal("MAIL FROM:<test@baleen.io> SIZE=100000\r\n");
		});
		it('RCPT command throws an error without a forward path.', function () {
			expect(function () {
				SMTPCommandLineParser.serializeCommand({verb: 'RCPT'})
			}).to.throw(Error);
		});
		it('RCPT command with forward path.', function () {
			expect(SMTPCommandLineParser.serializeCommand({
				verb: 'RCPT',
				forwardPath: 'test@baleen.io'
			})).to.be.equal("RCPT TO:<test@baleen.io>\r\n");
		});
		it('RCPT command with forward path and params.', function () {
			expect(SMTPCommandLineParser.serializeCommand({
				verb: 'RCPT',
				forwardPath: 'test@baleen.io',
				params: [{
					SIZE: 10000
				}]
			})).to.be.equal("RCPT TO:<test@baleen.io> SIZE=10000\r\n");
		});
		it('Command preserves the order of input params.', function () {
			expect(SMTPCommandLineParser.serializeCommand(
				{
					verb: 'RCPT',
					forwardPath: 'test@baleen.io',
					params: [
						{A: 1},
						{B: 2},
						{C: 3}
					]
				}
			)).to.be.equal("RCPT TO:<test@baleen.io> A=1 B=2 C=3\r\n");
		});
	});
	
	describe('Stream API', function () {
		
		it("parses simple SMTP command from streams.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done();
				})
				.catch(function (error) {
					done(error);
				});
			inputStream.setEncoding('utf8');
			inputStream.push("QUIT\r\n");
			inputStream.push(null);
		});
		
		it("emits an error if the stream ends before a CRLF is detected", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Premature end of input stream while parsing SMTP command.');
					done();
				});
			inputStream.push("QUIT");
			inputStream.push(null);
		});
		
		it("emits an error if the stream provides more data after a CRLF is detected", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Input stream provided additional octets after CRLF line break.');
					done();
				});
			inputStream.push("QUIT\r\nRSET");
			inputStream.push(null);
		});
		
		it("emits an error if CRLF are in wrong order.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Input stream contains unsupported line break.');
					done();
				});
			inputStream.push("QUIT\n\r");
			inputStream.push(null);
		});
		
		it("emits an error if the CR is missing.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Input stream contains unsupported line break.');
					done();
				});
			inputStream.push("QUIT\n");
			inputStream.push(null);
		});
		
		it("emits an error if the LF is missing in the middle of the stream.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Input stream contains unsupported line break.');
					done();
				});
			inputStream.push("REST\r");
			inputStream.push("RSET");
		});
		
		it("emits an error if the LF is missing at the end of the stream.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Premature end of input stream while parsing SMTP command.');
					done();
				});
			inputStream.push("REST\r");
			inputStream.push(null);
		});
		
		it("emits an error if the command line gets too long.", function (done) {
			var parser = new SMTPCommandLineParser();
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Number of input bytes exceeds size limit of 512 octets.');
					done();
				});
			for (var idx = 0; idx < 105; idx++) {
				inputStream.push("XXXX ");
			}
		});
		
		it("emits an timeout error if the command line is not received within timeout.", function (done) {
			var parser = new SMTPCommandLineParser();
			parser.timeout = 500;
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					expect(error.message).to.be.equal(strfmt('Timeout waiting on SMTP command for more than %d seconds.', parser.timeout / 1000));
					done();
				});
			setTimeout(	function () {
					inputStream.push("QUIT\r\n");
			}, parser.timeout + 1000);
		});
		
		
		it("calls parseCommandLine() method with the next line from the stream", function (done) {
			var parser = new SMTPCommandLineParser();
			parser.parseCommandLine = function(line) {
				expect(line).to.be.equal("QUIT");
				done();
			};
			var inputStream = new stream.Readable();
			inputStream._read = function () {
			};
			parser.parse(inputStream)
				.then(function (command) {
				})
				.catch(function (error) {
					expect(error.message).to.be.equal('Number of input bytes exceeds size limit of 512 octets.');
					done();
				});
			inputStream.push("QUIT\r\n");
			inputStream.push(null);
		});

	});
});