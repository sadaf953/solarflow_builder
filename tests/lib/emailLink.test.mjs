import test from 'node:test';
import assert from 'node:assert/strict';
import { emailLinkProblem, readEmailLink } from '../../template/src/lib/emailLink.js';

test('readEmailLink reads invite and recovery links from the email templates', () => {
    assert.deepEqual(readEmailLink('https://acme.example.in/?token_hash=abc123&type=invite'), { tokenHash: 'abc123', type: 'invite' });
    assert.deepEqual(readEmailLink('https://acme.example.in/?token_hash=abc123&type=recovery#/quotations'), { tokenHash: 'abc123', type: 'recovery' });
});

test('readEmailLink ignores other addresses and link types', () => {
    assert.equal(readEmailLink('https://acme.example.in/'), null);
    assert.equal(readEmailLink('https://acme.example.in/?code=abc'), null);
    assert.equal(readEmailLink('https://acme.example.in/?token_hash=abc&type=signup'), null);
    assert.equal(readEmailLink('https://acme.example.in/?token_hash=%20&type=invite'), null);
    assert.equal(readEmailLink('https://acme.example.in/#/?token_hash=abc&type=invite'), null);
    assert.equal(readEmailLink('not a url'), null);
});

test('emailLinkProblem tells a dead link from a network failure', () => {
    assert.match(emailLinkProblem('invite', { message: 'Email link is invalid or has expired' }), /invitation link has expired.*Forgot password/);
    assert.match(emailLinkProblem('recovery', { message: 'Token has expired or is invalid' }), /password reset link has expired/);
    assert.match(emailLinkProblem('invite', { name: 'AuthRetryableFetchError', message: 'Failed to fetch' }), /internet connection/);
});
