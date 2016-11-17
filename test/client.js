var expect = require("chai").expect;

var SMTPClient = require('../src/client');

describe('SMTP Client', function() {

    describe('constructor', function() {

        it('returns an SMTPClient instance', function() {
            var client = new SMTPClient();
            expect(client).to.be.an.instanceOf(SMTPClient);
        });

    });

});