var expect = require("chai").expect;
var net = require('net');
var os = require('os');
var SMTPServer = require('smtp-server').SMTPServer;

var SMTPClient = require('../src/client');

describe('SMTP Client', function () {
	
	describe('Constructor', function () {
		
		it('returns an SMTPClient instance', function () {
			var client = new SMTPClient();
			expect(client).to.be.an.instanceOf(SMTPClient);
		});
		
		it('uses default values from RFC 5321', function () {
			var client = new SMTPClient();
			expect(client.timeout).to.equal(300000);
			expect(client.maxReplyLineLength).to.equal(512);
			expect(client.maxCommandLineLength).to.equal(512);
			expect(client.maxDataLineLength).to.equal(1000);
		});
		
	});
	
	describe('Connecting to a server', function () {
		
		var server;
		var serverPort;
		
		afterEach(function () {
			if (server) {
				server.close();
			}
			server = null;
		});
		
		it('connects to an SMTP server and returns a promise which resolves with a new client instance.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort).then(function (client) {
				try {
					expect(client).to.be.an.instanceOf(SMTPClient);
					expect(client.socket).to.be.an.instanceOf(net.Socket);
					expect(client.socket.remotePort).to.equal(serverPort);
					var message = os.hostname() + " ESMTP";
					expect(client.server.greeting).to.eql({code: 220, message: message, lines: [message]});
					done();
				} catch (error) {
					done(error);
				}
			}).catch(function (error) {
				done(error);
			});
		});
		
		it('connect() rejects a promise when connection fails.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort + 1).then(function (client) {
				done(new Error('Test succeeded unexpectedly.'));
			}).catch(function (error) {
				done();
			});
		});
		
		it('connect() rejects a promise when initial server greeting times out.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					setTimeout(callback, 1000);
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient({timeout: 500});
			client.connect('localhost', serverPort).then(function (client) {
				done(new Error('Test succeeded unexpectedly.'));
			}).catch(function (error) {
				expect(error.message).to.equal('Timeout parsing reply after 0.5 seconds.');
				try {
					done();
				} catch (error) {
					done(error);
				}
			});
		});
		
		it('connect() rejects a promise when initial server is too long.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient({maxReplyLineLength: 4});
			client.connect('localhost', serverPort).then(function (client) {
				done(new Error('Test succeeded unexpectedly.'));
			}).catch(function (error) {
				try {
					expect(error.message).to.equal('Number of input bytes exceeds line limit of 4 octets.');
					done();
				} catch (error) {
					done(error);
				}
			});
		});
		
	});
	
	describe.only('Sending a command to the server', function () {
		
		var server;
		var serverPort;
		
		afterEach(function () {
			if (server) {
				server.close();
				server = null;
			}
		});
		
		
		it('resolves with the reply if command has been sent successfully.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer();
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function (client) {
					return client.command('EHLO ' + os.hostname());
				})
				.then(function (reply) {
					try {
						done();
					} catch(error) {
						done(error);
					}
				})
				.catch(function (error) {
					done(error);
				});
		});
		
	});
	
});