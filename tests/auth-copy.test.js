import test from 'node:test';
import assert from 'node:assert/strict';
import { authCopy, authenticationMessage } from '../src/components/auth/authCopy.js';

test('phone OTP failures use safe localized messages', () => {
  assert.equal(authenticationMessage({ code: 'invalid_otp' }, authCopy.fr, 'phone'), authCopy.fr.phoneCodeInvalid);
  assert.equal(authenticationMessage({ code: 'otp_expired' }, authCopy.en, 'phone'), authCopy.en.phoneCodeInvalid);
  assert.equal(authenticationMessage({ code: 'over_sms_send_rate_limit' }, authCopy.fr, 'phone'), authCopy.fr.rateError);
});
