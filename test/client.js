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
		
		it('connects to an SMTP server and returns a promise which resolves with the server greeting.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort).then(function (reply) {
				try {
					expect(client.secure).to.be.false;
					expect(client.socket).to.be.an.instanceOf(net.Socket);
					expect(client.socket.remotePort).to.equal(serverPort);
					var message = os.hostname() + " ESMTP";
					expect(reply).to.eql({
						code: 220,
						message: message,
						lines: [message],
						intermediate: false,
						success: true
					});
					done();
				} catch (error) {
					done(error);
				}
			}).catch(function (error) {
				done(error);
			});
		});
		
		it('connects via TLS to an SMTP server and returns a promise which resolves with the server greeting.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				secure: true,
				rejectUnauthorized: false,
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort, {
				tls: {
					rejectUnauthorized: false
				}
			}).then(function (reply) {
				try {
					expect(client.secure).to.be.true;
					expect(client.socket).to.be.an.instanceOf(net.Socket);
					expect(client.socket.remotePort).to.equal(serverPort);
					var message = os.hostname() + " ESMTP";
					expect(reply).to.eql({
						code: 220,
						message: message,
						lines: [message],
						intermediate: false,
						success: true
					});
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
			client.connect('localhost', serverPort + 1).then(function () {
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
			client.connect('localhost', serverPort).then(function () {
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
			client.connect('localhost', serverPort).then(function () {
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
	
	describe('Sending a command to the server', function () {
		
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
				.then(function () {
					return client.command('EHLO ' + os.hostname());
				})
				.then(function (reply) {
					try {
						expect(reply).to.have.property('code');
						expect(reply).to.have.property('message');
						expect(reply).to.have.property('lines');
						done();
					} catch (error) {
						done(error);
					}
				})
				.catch(function (error) {
					done(error);
				});
		});
		
		it('rejects the promise if the connection is closed.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer();
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function () {
					client.close();
					return client.command('EHLO ' + os.hostname());
				})
				.then(function () {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					try {
						expect(error).to.be.an.instanceOf(Error);
						expect(error.message).to.equal('Client is not connected.');
						done();
					} catch (error) {
						done(error);
					}
				});
		});
		
		it('rejects the promise if the reply does not arrive in time.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				authOptional: true,
				onMailFrom: function (address, session, callback) {
					setTimeout(callback, 1000);
				}
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function () {
					return client.command('EHLO ' + os.hostname());
				})
				.then(function () {
					return client.command('MAIL FROM:<>', {timeout: 500});
				})
				.then(function (reply) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					try {
						expect(error).to.be.an.instanceOf(Error);
						expect(error.message).to.equal('Timeout parsing reply after 0.5 seconds.');
						done();
					} catch (error) {
						done(error);
					}
				});
		});
		
		it('rejects the promise if the reply contains too many octets.', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				authOptional: true
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function () {
					return client.command('EHLO ' + os.hostname());
				})
				.then(function () {
					return client.command('MAIL FROM:<>', {maxReplyLineLength: 4});
				})
				.then(function (reply) {
					done(new Error('Test succeeded unexpectedly.'));
				})
				.catch(function (error) {
					try {
						expect(error).to.be.an.instanceOf(Error);
						expect(error.message).to.equal('Number of input bytes exceeds line limit of 4 octets.');
						done();
					} catch (error) {
						done(error);
					}
				});
		});
		
	});
	
	describe("Sending DATA to the server", function () {
		
		var serverPort;
		var server;
		var client;
		
		beforeEach(function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				authOptional: true
			});
			server.listen(serverPort);
			client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function () {
					return client.command('EHLO ' + os.hostname());
				})
				.then(function () {
					return client.command('MAIL FROM:<>');
				})
				.then(function () {
					return client.command('RCPT TO:<test@baleen-mx.io>');
				})
				.then(function () {
					return client.command('DATA');
				})
				.then(function () {
					done();
				})
				.catch(function (error) {
					done(error);
				});
			
		});
		
		afterEach(function () {
			if (server) {
				server.close();
				server = null;
			}
		});
		
		
		it("resolves a promise with the reply if data has been sent successfully.", function (done) {
			var data = "Subject: TEST\r\n"
				+ "\r\n"
				+ "Testmail";
			client.data(data)
				.then(function (reply) {
					try {
						expect(reply).to.be.exist;
						expect(reply.code).to.equal(250);
						done();
					} catch (error) {
						done(error);
					}
				})
				.catch(function (error) {
					done(error);
				});
			
		});
	});
	
	describe('Upgrading connection to TLS', function () {
		
		it('resolves a promise after upgrade was successful.', function (done) {
			var serverPort = Math.floor(Math.random() * 10000) + 20000;
			var server = new SMTPServer({
				authOptional: true
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			client.connect('localhost', serverPort)
				.then(function () {
					expect(client.secure).to.be.false;
					return client.command('EHLO ' + os.hostname());
				})
				.then(function (reply) {
					expect(reply.lines).to.contain('STARTTLS');
					return client.command('STARTTLS');
				})
				.then(function (reply) {
					expect(reply.success).to.be.true;
					return client.upgrade({tls: {rejectUnauthorized: false}});
				})
				.then(function () {
					expect(client.secure).to.be.true;
					done();
				})
				.catch(function (error) {
					done(error);
				});
		});
		
	});
	
	describe('Cleanup', function () {
		
		it("cleans up after connection has been closed by client.", function (done) {
			var serverPort = Math.floor(Math.random() * 10000) + 20000;
			var server = new SMTPServer({
				authOptional: true
			});
			server.listen(serverPort);
			var client = new SMTPClient();
			var orig = client._cleanup;
			
			client.connect('localhost', serverPort)
				.then(function () {
					client._cleanup = function () {
						client._cleanup = orig;
						client._cleanup();
						done();
					};
					client.close();
				})
				.catch(function (error) {
					done(error);
				});
			
		});
		
	});
	
});