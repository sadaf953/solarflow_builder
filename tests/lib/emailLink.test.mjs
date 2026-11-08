import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PASSWORD_PENDING_KEY, clearPasswordPending, emailLinkProblem, isPasswordPending, isSessionGone, markPasswordPending, readEmailLink,
} from '../../template/src/lib/emailLink.js';

const memoryStorage = () => {
    const items = new Map();
    return {
        getItem: key => (items.has(key) ? items.get(key) : null),
        setItem: (key, value) => items.set(key, String(value)),
        removeItem: key => items.delete(key),
    };
};
const brokenStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

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

test('an invited user who reloads before choosing a password gets the dialog back', () => {
    const storage = memoryStorage();
    markPasswordPending(storage, 'user-1');
    assert.equal(storage.getItem(PASSWORD_PENDING_KEY), 'user-1');
    assert.ok(PASSWORD_PENDING_KEY.startsWith('solarflow_'), 'signing out clears solarflow_ session keys');
    assert.equal(isPasswordPending(storage, 'user-1'), true);
    assert.equal(isPasswordPending(storage, 'user-2'), false, 'another login on this browser is not asked');
    assert.equal(isPasswordPending(storage, undefined), false, 'no session, no dialog');
    clearPasswordPending(storage);
    assert.equal(isPasswordPending(storage, 'user-1'), false);
    markPasswordPending(storage, '');
    assert.equal(storage.getItem(PASSWORD_PENDING_KEY), null);
});

test('the password flag never throws when storage is blocked or missing', () => {
    for (const storage of [brokenStorage, null]) {
        assert.doesNotThrow(() => markPasswordPending(storage, 'user-1'));
        assert.equal(isPasswordPending(storage, 'user-1'), false);
        assert.doesNotThrow(() => clearPasswordPending(storage));
    }
});

test('isSessionGone tells an ended sign-in from other password errors', () => {
    assert.equal(isSessionGone({ name: 'AuthSessionMissingError', message: 'Auth session missing!' }), true);
    assert.equal(isSessionGone({ code: 'session_not_found', message: 'Session from session_id claim in JWT does not exist' }), true);
    assert.equal(isSessionGone({ message: 'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired' }), true);
    assert.equal(isSessionGone({ code: 'bad_jwt', message: 'invalid JWT' }), true);
    assert.equal(isSessionGone({ code: 'weak_password', message: 'Password should be at least 8 characters.' }), false);
    assert.equal(isSessionGone(null), false);
});
