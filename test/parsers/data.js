var data = require('../../src/parsers/data');
var expect = require('chai').expect;
var stream = require('stream');

describe('SMTP DATA transform streams', function () {
	
	describe('DotEncoder', function () {
		
		describe('constructor', function () {
			
			it('returns an DotEncoder instance which is a transform stream', function () {
				var enc = new data.DotEncoder();
				expect(enc).to.be.an.instanceOf(data.DotEncoder);
				expect(enc).to.be.an.instanceOf(stream.Transform);
			});
			
			it('can encode string inputs verbatim if no dot is involved.', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/^This is a test string\./);
					expect(output).to.match(/\r\n\.\r\n$/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push('This is a test string.');
				inputStream.push(null);
			});
			
			it('appends <CRLF>.<CRLF> if input does not end with a line break.', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/\r\n\.\r\n$/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\r\nAnother line");
				inputStream.push(null);
			});
			
			it('does not append another <CRLF> if input ends with a line break.', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.not.match(/(\r\n){2}\.\r\n$/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\r\nAnother line\r\n");
				inputStream.push(null);
			});
			
			it('replaces bare <CR> occurrences with <CRLF>', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/string\.\r\nAnother/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\rAnother line");
				inputStream.push(null);
			});
			
			it('replaces bare <LF> occurrences with <CRLF>', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/string\.\r\nAnother/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\nAnother line");
				inputStream.push(null);
			});
			
			it('deals with bare <CR> occurrences at string end', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/\r\n\.\r\n$/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\r\nAnother line\r");
				inputStream.push(null);
			});
			
			it('deals with bare <LF> occurrences at string end', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.match(/\r\n\.\r\n$/);
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push("This is a test string.\r\nAnother line\n");
				inputStream.push(null);
			});
			
			it('escapes line consisting of a single dot', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.equal("..\r\n.\r\n");
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push(".");
				inputStream.push(null);
			});
			
			it('escapes lines with a leading dot', function (done) {
				var inputStream = new stream.Readable({
					read: function () {
					}
				});
				var encoder = inputStream.pipe(new data.DotEncoder());
				var output = "";
				encoder.on('data', function (chunk) {
					output += chunk.toString('ascii');
				});
				encoder.on('end', function () {
					expect(output).to.equal("..testline\r\n.\r\n");
					done();
				});
				encoder.on('error', function (error) {
					done(error);
				});
				inputStream.push(".testline");
				inputStream.push(null);
			});
			
		});
		
	});
	
	
	describe('DotDecoder', function () {
		
		var inputStream;
		beforeEach(function () {
			inputStream = new stream.Readable({
				read: function () {
				}
			});
		});
		
		it('constructor returns a DotDecoder instance which is a transform stream', function () {
			var decoder = new data.DotDecoder();
			expect(decoder).to.be.an.instanceOf(data.DotDecoder);
			expect(decoder).to.be.an.instanceOf(stream.Transform);
		});
		
		it('decodes strings verbatim that do not contain dots at line beginnings', function (done) {
			var input = "This is a test line.\r\n";
			var decoder = inputStream.pipe(new data.DotDecoder());
			decoder.on('data', function (chunk) {
				chunk = chunk.toString('utf8');
				try {
					expect(chunk).to.equal(input);
					done();
				} catch (error) {
					done(error);
				}
			});
			decoder.on('error', function (error) {
				done(error);
			});
			inputStream.push(input);
		});
		
		it('removes a dot at the beginning of a line', function (done) {
			var input = ".This is a test line.\r\n";
			var decoder = inputStream.pipe(new data.DotDecoder());
			decoder.on('data', function (chunk) {
				chunk = chunk.toString('utf8');
				try {
					expect(chunk).to.equal("This is a test line.\r\n");
					done();
				} catch (error) {
					done(error);
				}
			});
			decoder.on('error', function (error) {
				done(error);
			});
			inputStream.push(input);
		});
		
		it('removes only the first dot at the beginning of a line', function (done) {
			var input = "..This is a test line.\r\n";
			var decoder = inputStream.pipe(new data.DotDecoder());
			decoder.on('data', function (chunk) {
				chunk = chunk.toString('utf8');
				try {
					expect(chunk).to.equal(input.slice(1));
					done();
				} catch (error) {
					done(error);
				}
			});
			decoder.on('error', function (error) {
				done(error);
			});
			decoder.on('end', function () {
			});
			inputStream.push(input);
		});
		
		it('ends the decoder stream after a line with a single dot', function (done) {
			var input = "This is a test line.\r\n.\r\n";
			var decoder = inputStream.pipe(new data.DotDecoder());
			var text= "";
			decoder.on('data', function (chunk) {
				try {
					chunk = chunk.toString('utf8');
					text += chunk;
				} catch (error) {
					done(error);
				}
			});
			decoder.on('error', function (error) {
				done(error);
			});
			decoder.on('end', function () {
				expect(text).to.equal("This is a test line.\r\n");
				done();
			});
			inputStream.push(input);
		});
		
		it('leaves the input stream open after a line with a single dot', function (done) {
			var input = "This is a test line.\r\n.\r\n";
			var decoder = inputStream.pipe(new data.DotDecoder());
			var text;
			decoder.on('data', function (chunk) {
				try {
					chunk = chunk.toString('utf8');
					text = chunk;
				} catch (error) {
					done(error);
				}
			});
			decoder.on('error', function (error) {
				done(error);
			});
			decoder.on('end', function () {
				expect(text).to.equal("This is a test line.\r\n");
			});
			inputStream.on('data', function(chunk) {
				chunk = chunk.toString('utf8');
				if ( chunk == "This is a test line.\r\n.\r\n") return;
				try {
					expect(text).to.equal("This is a test line.\r\n");
					expect(chunk).to.equal("CONTINUED.\r\n");
					done();
				} catch (error) {
					done(error);
				}
			});
			inputStream.push(input);
			inputStream.push("CONTINUED.\r\n");
		});
		
	});
	
});