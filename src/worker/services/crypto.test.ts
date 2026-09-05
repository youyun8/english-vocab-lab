import { describe, expect, it } from 'vitest';

import { generateId, generateToken, hashToken, hmac, timingSafeEqual } from './crypto';

describe('generateToken', () => {
  it('produces URL-safe tokens with no padding', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('produces at least 256 bits of entropy per token', () => {
    // 32 bytes base64url-encoded is 43 characters.
    expect(generateToken().length).toBeGreaterThanOrEqual(43);
  });

  it('never repeats across many draws', () => {
    const tokens = new Set(Array.from({ length: 500 }, generateToken));
    expect(tokens.size).toBe(500);
  });
});

describe('generateId', () => {
  it('prefixes a uuid so ids are self-describing', () => {
    expect(generateId('usr')).toMatch(
      /^usr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe('hashToken', () => {
  it('returns a 64-character hex SHA-256 digest', async () => {
    expect(await hashToken('hello')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is stable for the same input', async () => {
    expect(await hashToken('abc')).toBe(await hashToken('abc'));
  });

  it('produces a different digest for a different token', async () => {
    expect(await hashToken('abc')).not.toBe(await hashToken('abd'));
  });

  it('never returns the raw token', async () => {
    const token = generateToken();
    expect(await hashToken(token)).not.toBe(token);
  });
});

describe('hmac', () => {
  it('depends on the secret', async () => {
    expect(await hmac('secret-a', 'msg')).not.toBe(await hmac('secret-b', 'msg'));
  });

  it('depends on the message', async () => {
    expect(await hmac('secret', 'a')).not.toBe(await hmac('secret', 'b'));
  });

  it('is deterministic', async () => {
    expect(await hmac('secret', 'msg')).toBe(await hmac('secret', 'msg'));
  });
});

describe('timingSafeEqual', () => {
  it('returns true only for identical strings', () => {
    expect(timingSafeEqual('abcdef', 'abcdef')).toBe(true);
    expect(timingSafeEqual('abcdef', 'abcdeg')).toBe(false);
  });

  it('returns false for different lengths without throwing', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', 'a')).toBe(false);
  });
});
