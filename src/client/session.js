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

/**
 * @fileOverview Defines a state of an SMTP client connection.
 *
 */
'use strict';

var events = require('events');
var SMTPClient = require('./../client');
var SMTPCommandLineParser = require('../parsers/command');

var URI = require('urijs');
var VError = require('verror');
var _ = require('underscore');

module.exports = SMTPClientSession;


SMTPClientSession.prototype = Object.create(events.EventEmitter.prototype);
SMTPClientSession.prototype.constructor = SMTPClientSession;

/**
 * This module defines an SMTP client state. A state is the process from the initial connection to the
 * successful end of the connection or the first fatal error. The SMTPClientSession object is an event emitter
 * and sends events before and after each SMTP command. Additionally there is a 'connect' event and a 'connected'
 * event to represent the state before the connection is about to be established and after a successful connection.
 * <p>
 * The state can be provided with data in advance such as sender, recipients and mail data and tries its best to
 * work through the various steps to transmit the data. However if at a certain step data is missing, the state
 * will be aborted.
 * <p>
 * Event listeners can control the course of events by either adding or changing state data and SMTP commands, sending
 * custom commands in between the steps or putting a veto based on server replies.
 *
 * Creates a new SMTPClientSession object. The first parameter is a string or an URI from
 * <a href="https://medialize.github.io/URI.js/">URI.js</a> representing the SMTP connection.
 *
 * Use either one of the following URI schemes:
 *  <ul>
 *  <li>"smtp" for unencrypted SMTP connections</li>
 *  <li>"smtps" for connections via TLS</li>
 *  <li>"smtp+starttls" for connections upgraded with the STARTTLS extension</li>
 *  </ul>
 *
 * The state uses only the scheme, hostname and port part of the URI.
 *
 * @param {string|URI} uri - The URI of the SMTP connection - e.g. smtp://mx01.baleen-filter.io:25
 * @param [options] - an options object to customize the state
 * @param [options.tls] {object} - TLS options for the {@link SMTPClient#connect} method.
 * @param [options.client] {SMTPClient} - An optional SMTPClient instance to use for the connection. If this is omitted
 *    a new client with default settings is created.
 * @returns {SMTPClientSession}
 * @constructor
 * @class SMTPClientSession
 */
function SMTPClientSession(uri, options) {
	events.EventEmitter.call(this);
	this._emit = events.EventEmitter.prototype.emit.bind(this);
	
	options = Object.assign({}, options || {});
	if (!uri) {
		throw new VError('Parameter #1 (uri) is missing');
	}
	if (typeof uri === 'string') {
		uri = new URI(uri);
	}
	var protocol = uri.protocol().toLowerCase();
	if (!protocol) {
		throw new Error('Only absolute URI are supported.');
	}
	if (protocol != 'smtp' && protocol.toLowerCase() != 'smtps' && protocol != 'smtp+starttls') {
		throw new Error('Unsupported URI scheme (need "smtp" or "smtps"): ' + protocol);
	}
	if (!uri.hostname()) {
		throw new Error('Hostname is empty in URI: ' + uri.toString());
	}
	
	/** A unique ID identifying this state (e.g. in log files.)
	 * @type {string}
	 */
	this.id = _.uniqueId('#');
	
	/**
	 * The URI of the current state as an URI.js object.
	 * @type {URI}
	 */
	this.uri = uri;
	if (!this.uri.port()) {
		this.uri.port(protocol == 'smtps' ? '587' : '25');
	}
	var port = parseInt(this.uri.port());
	if (isNaN(port) || port <= 0) {
		throw new Error('Unparseable port in URI: ' + uri.toString());
	}
	
	/**
	 * The SMTPClient to use for the connection;
	 * @type {SMTPClient}
	 */
	this.client = options.client || new SMTPClient();
	
	/**
	 * The options object used in the constructor.
	 * @type {object}
	 */
	this.options = options;
	this.options.client = undefined;
	
	/** The current state data including the current stage of the session.
	 * @type {object}
	 */
	this.state = {
		stage: ""
	};
	return this;
}

/**
 * Ends the session by closing the server connection. This does not send a QUIT command. It emits an 'end' event,
 * to signal the new session state to the event listeners.
 */
SMTPClientSession.prototype.end = function () {
	if (this.state.ended) return;
	this.state.ended = true;
	if (this.state.connected) {
		try {
			self.state.connected = false;
			this.client.close();
		} catch (ignored) {
		}
	}
	this.emit('end', this);
};

/**
 * Aborts the session abnormally with an error message. An 'error' event is emitted, to indicate the abnormal session
 * end.
 *
 * @param {Error|string} [err] - An optional error or string message as a reason for the session end. If this argument is
 *    omitted, an 'Unknown reason' message is used.
 */
SMTPClientSession.prototype.abort = function (err) {
	if (this.state.ended) return;
	this.state.ended = true;
	this.state.error = err;
	if (this.state.connected) {
		try {
			self.state.connected = true;
			this.client.close();
		} catch (ignored) {
		}
	}
	err = err || new Error('Unknown reason.');
	this.emit('error', new VError(err, 'Session %s aborted', this.id));
};

/**
 *
 * Starts the session by connecting to the server. An 'connect' event is emitted before the client tries to connect.
 * If the connection is successful, a 'connected' event is emitted and the session state contains a new 'connect'
 * object with the actual connection details. These details can differ from the original connection parameters. The
 * 'connect' property includes the server greeting in the 'reply' property. It adds a boolean 'secure' property to the
 * session state, if the connection has been established through TLS.
 * <p>
 * If the connection fails, an 'error' event is emitted.
 */
SMTPClientSession.prototype.start = function () {
	this.state = {};
	this.state.stage = 'connect';
	
	var port = Number.parseInt(this.uri.port());
	var isTls = this.uri.protocol() == 'smtps';
	var tlsOpts;
	if (isTls && this.options.tls) {
		tlsOpts = this.options.tls;
	} else if (isTls) {
		tlsOpts = {};
	} else {
		tlsOpts = undefined;
	}
	var self = this;
	var _next = function () {
		self.client.connect(self.uri.hostname(), self.uri.port(), {tls: tlsOpts}
		).then(function (reply) {
			self.state.connected = true;
			self.state.secure = isTls;
			self.state.connect = {
				hostname: self.uri.hostname(),
				port: port,
				secure: isTls,
				tlsOpts: tlsOpts,
				reply: reply
			};
			self.state.lastReply = reply;
			self.emit('reply', reply);
		}).catch(function (err) {
			self.abort(new VError(err, "Unable to connect to %s", self.uri));
		});
	};
	self.emit('connect', this.uri, _next);
};

SMTPClientSession.prototype.command = function (command, options, timeout) {
	if (!timeout) {
		timeout = 0;
	}
	options = options || {};
	if ( typeof command === 'string' ) {
		command = new SMTPCommandLineParser().parseCommandLine(command);
	}
	this.state.lastCommand = command;
	this.state.lastCommandOptions = options;
	var self = this;
	this.emit('command', command, function () {
		self.client.command(command, options).then(function (reply) {
			self.emit('reply', reply, function () {
			}, {timeout: timeout});
		}).catch(function (err) {
			self.abort('error', new VError(err, 'Error sending command %s', command.verb));
		});
	}, { timeout: timeout });
};

SMTPClientSession.prototype.emit = function () {
	var eventName = arguments[0];
	if (eventName === 'command' || eventName === 'reply' || eventName === 'connect') {
		// Special emit for 'command' and 'reply' events.
		var firstArg = arguments[1];
		var onReady = arguments[2] || function() {};
		var options = arguments[3] || {};
		var listeners = this.listeners(eventName);
		if (!listeners || !listeners.length) {
			onReady.call();
			return;
		}
		options = options || {};
		if ( !options.timeout || options.timeout <= 0 ) {
			options.timeout = 3000;
		}
		var timer;
		var self = this;
		var callback = function (err) {
			// If there is no timer, the veto has timed out already.
			if (!timer) return;
			// If the session has ended, clear the timer and do nothing.
			if (self.state.ended) {
				clearTimeout(timer);
				timer = undefined;
				return;
			}
			if (err) {
				// If the callback was called with an error, abort the state.
				clearTimeout(timer);
				self.abort(new VError(err, "Event listener raised a veto in reply to '%s' event", eventName));
			} else {
				// If the callback was not called with an error, just wait for all callbacks to complete.
				if (!listeners.length) {
					// If all callbacks are completed, cancel the timer and proceed to next step.
					clearTimeout(timer);
					timer = undefined;
					onReady.call();
				} else {
					var nextListener = listeners.shift();
					nextListener.call(this, firstArg, callback);
				}
			}
		};
		timer = setTimeout(function () {
			timer = undefined;
			self.abort(new VError("Veto expired when waiting on listeners for '%s' event.", eventName));
		}, options.timeout);
		var nextListener = listeners.shift();
		nextListener.call(this, firstArg, callback);
		return;
	}
	return events.EventEmitter.prototype.emit.apply(this, arguments);
};
