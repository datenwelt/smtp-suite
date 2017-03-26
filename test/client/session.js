var expect = require("chai").expect;
var net = require('net');
var os = require('os');
var SMTPServer = require('smtp-server').SMTPServer;
var URI = require('urijs');

var VError = require('verror');

var SMTPClientSession = require('../../src/client/session');

describe.only('SMTP Client Session', function () {
	
	describe('Constructor', function () {
		
		it('returns an SMTPClientSession instance', function () {
			var session = new SMTPClientSession('smtp://localhost:25');
			expect(session).to.be.an.instanceOf(SMTPClientSession);
		});
		
		it('throws when the URI is missing', function () {
			var throwing = function () {
				new SMTPClientSession()
			};
			expect(throwing).to.throw();
		});
		
		it('throws when the URI is not absolute', function () {
			var throwing = function () {
				new SMTPClientSession('/test/');
			};
			expect(throwing).to.throw(Error, 'Only absolute URI are supported.');
		});
		
		it('throws when the URI has invalid scheme', function () {
			var throwing = function () {
				new SMTPClientSession('http://loalhost:25');
			};
			expect(throwing).to.throw(Error, 'Unsupported URI scheme (need "smtp" or "smtps"): http');
		});
		
		it('throws when the hostname is missing', function () {
			var throwing = function () {
				new SMTPClientSession('smtp:///');
			};
			expect(throwing).to.throw(Error, 'Hostname is empty in URI: smtp:///');
		});
		
		it('throws when port is invalid', function () {
			var throwing = function () {
				new SMTPClientSession('smtp://localhost:xx/');
			};
			expect(throwing).to.throw(Error, 'Unparseable port in URI: smtp://localhost:xx/');
			throwing = function () {
				new SMTPClientSession('smtp://localhost:-30/');
			};
			expect(throwing).to.throw(Error, 'Unparseable port in URI: smtp://localhost:-30/');
		});
		
		it('sets the default ports', function () {
			var uri, session;
			uri = 'smtp://localhost/';
			session = new SMTPClientSession(uri);
			expect(session.uri.port()).to.equal('25');
			uri = 'smtps://localhost/';
			session = new SMTPClientSession(uri);
			expect(session.uri.port()).to.equal('587');
			uri = 'smtp+starttls://localhost/';
			session = new SMTPClientSession(uri);
			expect(session.uri.port()).to.equal('25');
		});
		
		it('creates a state id', function () {
			var uri, session;
			uri = 'smtp://localhost/';
			session = new SMTPClientSession(uri);
			expect(session.id).to.exist;
		});
		
	});
	
	describe('session.emit()', function () {
		
		it('passes the event to all event listeners and executes the next step', function (done) {
			var session = new SMTPClientSession('smtp://localhost');
			var calls = 5;
			var _next = function () {
				expect(calls).to.equal(0);
				done();
			};
			for (var i = 0; i < calls; i++) {
				var listener = function (_unused_, callback) {
					calls--;
					callback();
				};
				session.on('command', listener);
			}
			session.on('error', function (err) {
				done(err);
			});
			session.emit('command', undefined, _next);
		});
		
		it('aborts the state when a veto is called', function (done) {
			var session = new SMTPClientSession('smtp://localhost');
			var _next = function () {
				done(new Error('Session was continued despite a listener called a veto.'));
			};
			session.on('command', function (sess, callback) {
				callback(new Error('Calling a veto.'));
			});
			session.on('error', function (err) {
				expect(err instanceof Error).to.be.true;
				expect(VError.cause(err)).to.exist;
				expect(VError.cause(err).message).to.equal("Event listener raised a veto in reply to 'command' event: Calling a veto.");
				done();
			});
			session.emit('command', undefined, _next);
		});
		
		it('aborts the state when a veto is called too late', function (done) {
			var session = new SMTPClientSession('smtp://localhost');
			var _next = function () {
				done(new Error('Session was continued even if a listener should have timed out.'));
			};
			session.on('command', function (sess, callback) {
				setTimeout(function () {
					callback(new Error('Test failed. Command did not expire as expected.'));
				}, 1000);
			});
			session.on('error', function (err) {
				expect(err instanceof Error).to.be.true;
				expect(VError.cause(err)).to.exist;
				expect(VError.cause(err).message).to.equal("Veto expired when waiting on listeners for 'command' event.");
				done();
			});
			session.emit('command', undefined, _next, {timeout: 500});
		});
		
	});
	
	describe('session.start()', function () {
		
		var server;
		var serverPort;
		
		afterEach(function () {
			if (server) {
				server.close();
			}
			server = null;
		});
		
		it('connects to a test server via plain SMTP', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var uri = new URI('smtp://localhost:' + serverPort + '/');
			var session = new SMTPClientSession(uri);
			var connectEmitted;
			session.on('connect', function (session, callback) {
				connectEmitted = true;
				callback();
			});
			session.on('reply', function (reply, callback) {
				try {
					expect(connectEmitted).to.be.true;
					var session = this;
					expect(session instanceof SMTPClientSession).to.be.true;
					expect(session.state.connected).to.be.true;
					expect(session.state.secure).to.be.false;
					expect(session.state.connect).to.exist;
					expect(session.state.connect.secure).to.be.false;
					expect(session.state.connect.hostname).to.equal('localhost');
					expect(session.state.connect.port).to.equal(serverPort);
					expect(session.state.connect.reply).to.exist;
					expect(session.state.connect.reply.code).to.equal(220);
					callback();
					session.end();
				} catch (err) {
					callback(err);
				}
			});
			session.on('end', function (err) {
				done();
			});
			session.on('error', function (err) {
				done(err);
			});
			session.start();
		});
		
		
		it('connects to a test server via SMTP over TLS', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				secure: true,
				rejectUnauthorized: false,
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var uri = new URI('smtps://localhost:' + serverPort + '/');
			var session = new SMTPClientSession(uri, {
				tls: {
					rejectUnauthorized: false
				}
			});
			var connectEmitted;
			session.on('connect', function (session, callback) {
				connectEmitted = true;
				callback();
			});
			session.on('reply', function (reply, callback) {
				try {
					expect(connectEmitted).to.be.true;
					var session = this;
					expect(session instanceof SMTPClientSession).to.be.true;
					expect(session.state.connected).to.be.true;
					expect(session.state.secure).to.be.true;
					expect(session.state.connect).to.exist;
					expect(session.state.connect.secure).to.be.true;
					expect(session.state.connect.hostname).to.equal('localhost');
					expect(session.state.connect.port).to.equal(serverPort);
					expect(session.state.connect.reply).to.exist;
					expect(session.state.connect.reply.code).to.equal(220);
					callback();
					session.end();
				} catch (err) {
					callback(err);
				}
			});
			session.on('end', function (err) {
				done();
			});
			session.on('error', function (err) {
				done(err);
			});
			session.start();
		});
		
		it('emits an error event when the connection fails', function (done) {
			var port = Math.floor(Math.random() * 10000) + 20000;
			var uri = new URI('smtp://localhost:' + serverPort + '/');
			var session = new SMTPClientSession(uri);
			var connectEmitted;
			session.on('connect', function (reply, callback) {
				connectEmitted = true;
				callback();
			});
			session.on('error', function (err) {
				try {
					expect(connectEmitted).to.be.true;
					expect(VError.cause(err).message).to.contain('ECONNREFUSED');
					done();
				} catch (e) {
					done(e);
				}
				session.end();
			});
			session.on('reply', function () {
				done(new Error('Session connected successfully which is unexpected.'));
			});
			session.start();
		});
		
	});
	
	describe('session.command()', function () {
		
		var server;
		var serverPort;
		
		afterEach(function () {
			if (server) {
				server.close();
			}
			server = null;
		});
		
		it('emits a "command" event with the last command as first argument', function (done) {
			serverPort = Math.floor(Math.random() * 10000) + 20000;
			server = new SMTPServer({
				onConnect: function (session, callback) {
					callback();
				}
			});
			server.listen(serverPort);
			var uri = new URI('smtp://localhost:' + serverPort + '/');
			var session = new SMTPClientSession(uri);
			session.on('error', function (err) {
				done(err);
			});
			session.on('reply', function (reply, callback) {
				if (!session.state.lastCommand) {
					session.command('EHLO test.de');
					callback();
				} else if (session.state.lastCommand.verb === 'EHLO') {
					done();
				} else {
					done(new Error('Unexepcted command reply: ' + JSON.stringify((reply))));
				}
			});
			session.on('command', function (command, callback) {
				expect(command).to.exist;
				expect(command.verb).to.equal('EHLO');
				expect(command.domain).to.equal('test.de');
				callback();
			});
			session.start();
		});
		
	});
	
});