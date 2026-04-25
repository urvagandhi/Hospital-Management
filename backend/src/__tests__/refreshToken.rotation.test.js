/**
 * Refresh Token Rotation + Reuse Detection
 *
 * Verifies:
 *  1. Two consecutive refreshes each issue different refresh tokens.
 *  2. The session document's `refreshToken` field is updated in place.
 *  3. Replaying a rotated-out refresh token returns an error AND revokes
 *     all active sessions for that hospital when any other session exists.
 *  4. Presenting a rotated-out token when NO sessions are active is a plain
 *     error (no blast-radius escalation for post-logout retries).
 *
 * Uses Jest's unstable_mockModule so Session / Hospital / mail / push layers
 * are replaced without a live MongoDB. Keeps this file self-contained and
 * compatible with the existing `npm test` (jest --coverage) setup.
 */

import { jest } from "@jest/globals";

// In-memory fake session store — resembles a Mongoose-ish Session model just
// enough to cover the paths refreshAccessToken touches.
const sessionStore = new Map();

const makeSessionDoc = (raw) => ({
  ...raw,
  save: jest.fn(async function save() {
    sessionStore.set(String(this._id), { ...this, save: this.save });
  }),
});

const SessionMock = {
  findOne: jest.fn(async (query) => {
    for (const s of sessionStore.values()) {
      if (
        s.refreshToken === query.refreshToken &&
        (!query.isActive || s.isActive === query.isActive) &&
        (!query.expiresAt || s.expiresAt > query.expiresAt.$gt)
      ) {
        return makeSessionDoc(s);
      }
    }
    return null;
  }),
  countDocuments: jest.fn(async (query) => {
    let n = 0;
    for (const s of sessionStore.values()) {
      if (
        String(s.hospitalId) === String(query.hospitalId) &&
        s.isActive === query.isActive &&
        s.expiresAt > query.expiresAt.$gt
      ) {
        n += 1;
      }
    }
    return n;
  }),
  updateMany: jest.fn(async (query, update) => {
    let modified = 0;
    for (const [id, s] of sessionStore.entries()) {
      if (
        String(s.hospitalId) === String(query.hospitalId) &&
        s.isActive === query.isActive
      ) {
        sessionStore.set(id, { ...s, ...update });
        modified += 1;
      }
    }
    return { modifiedCount: modified };
  }),
};

const HospitalMock = {
  findById: jest.fn(() => ({
    select: () => ({ lean: async () => ({ email: "owner@example.com" }) }),
  })),
};

// Push + mail are fire-and-forget — stub them so tests can assert calls.
const notifySessionRevoked = jest.fn(async () => {});
const sendSessionRevokedEmail = jest.fn(async () => {});
const notifyNewLogin = jest.fn(async () => {});
const sendNewLoginAlertEmail = jest.fn(async () => {});
const geolocateIp = jest.fn(async () => ({}));

// JWT utils: return predictable-but-unique tokens per call.
let tokenCounter = 0;
const generateRefreshToken = jest.fn((hospitalId) => {
  tokenCounter += 1;
  return `refresh-token-${hospitalId}-${tokenCounter}`;
});
const generateAccessToken = jest.fn(() => "access-token-stub");
// Decode the fake token to recover the hospitalId encoded in it.
const verifyRefreshToken = jest.fn((token) => {
  const match = /^refresh-token-(.+)-\d+$/.exec(token);
  if (!match) throw new Error("jwt malformed");
  return { id: match[1], type: "refresh" };
});

jest.unstable_mockModule("../models/Session.js", () => ({ default: SessionMock }));
jest.unstable_mockModule("../models/Hospital.js", () => ({ default: HospitalMock }));
jest.unstable_mockModule("../utils/jwt.js", () => ({
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
}));
jest.unstable_mockModule("../services/push.service.js", () => ({
  notifySessionRevoked,
  notifyNewLogin,
}));
jest.unstable_mockModule("../services/mail.service.js", () => ({
  sendSessionRevokedEmail,
  sendNewLoginAlertEmail,
}));
jest.unstable_mockModule("../services/geoip.service.js", () => ({ geolocateIp }));
jest.unstable_mockModule("../config/env.js", () => ({
  default: { JWT_EXPIRY: "15m" },
}));

// Dynamic import AFTER the mocks are registered.
const { refreshAccessToken } = await import("../services/token.service.js");

const HOSPITAL_ID = "hospital-42";
const farFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);

const seedSession = (idSuffix = "1") => {
  const initialToken = `refresh-token-${HOSPITAL_ID}-seed-${idSuffix}`;
  const sessionId = `sess-${idSuffix}`;
  sessionStore.set(sessionId, {
    _id: sessionId,
    hospitalId: HOSPITAL_ID,
    refreshToken: initialToken,
    isActive: true,
    expiresAt: farFuture,
    lastAccessedAt: new Date(),
    isMobile: false,
  });
  // Patch verifyRefreshToken so the seed token (which doesn't match our
  // generator pattern) also decodes correctly.
  verifyRefreshToken.mockImplementation((token) => {
    if (token === initialToken) return { id: HOSPITAL_ID, type: "refresh" };
    const match = /^refresh-token-(.+)-\d+$/.exec(token);
    if (!match) throw new Error("jwt malformed");
    return { id: match[1], type: "refresh" };
  });
  return { sessionId, initialToken };
};

describe("refreshAccessToken — rotation + reuse", () => {
  beforeEach(() => {
    sessionStore.clear();
    jest.clearAllMocks();
    tokenCounter = 0;
  });

  test("rotates the refresh token on every successful refresh", async () => {
    const { sessionId, initialToken } = seedSession();

    const first = await refreshAccessToken(initialToken);
    expect(first.refreshToken).toBeTruthy();
    expect(first.refreshToken).not.toBe(initialToken);
    expect(sessionStore.get(sessionId).refreshToken).toBe(first.refreshToken);

    const second = await refreshAccessToken(first.refreshToken);
    expect(second.refreshToken).toBeTruthy();
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(sessionStore.get(sessionId).refreshToken).toBe(second.refreshToken);

    // Happy-path refreshes don't trigger any revocation.
    expect(SessionMock.updateMany).not.toHaveBeenCalled();
    expect(notifySessionRevoked).not.toHaveBeenCalled();
  });

  test("replaying a rotated-out token revokes ALL sessions + notifies hospital", async () => {
    const { initialToken } = seedSession();

    // First refresh rotates — initialToken is now stale.
    await refreshAccessToken(initialToken);

    // Attacker replays the old token.
    await expect(refreshAccessToken(initialToken)).rejects.toThrow(
      /Invalid or expired refresh token/,
    );

    expect(SessionMock.updateMany).toHaveBeenCalledWith(
      { hospitalId: HOSPITAL_ID, isActive: true },
      { isActive: false, revokedReason: "REFRESH_TOKEN_REUSE" },
    );
    expect(notifySessionRevoked).toHaveBeenCalledWith(HOSPITAL_ID);

    // Wait a tick for the fire-and-forget email promise chain.
    await new Promise((r) => setImmediate(r));
    expect(sendSessionRevokedEmail).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({ reason: "REFRESH_TOKEN_REUSE" }),
    );
  });

  test("presenting a stale token when no sessions are active is a plain 401 (no blast radius)", async () => {
    const { initialToken } = seedSession();

    // Simulate legitimate logout — session hard-deleted.
    sessionStore.clear();

    await expect(refreshAccessToken(initialToken)).rejects.toThrow(
      /Invalid or expired refresh token/,
    );

    // No revocations triggered (nothing to protect).
    expect(SessionMock.updateMany).not.toHaveBeenCalled();
    expect(notifySessionRevoked).not.toHaveBeenCalled();
    expect(sendSessionRevokedEmail).not.toHaveBeenCalled();
  });

  test("malformed JWT signature surfaces as refresh failure without DB writes", async () => {
    verifyRefreshToken.mockImplementationOnce(() => {
      throw new Error("invalid signature");
    });

    await expect(refreshAccessToken("garbage")).rejects.toThrow(
      /Failed to refresh token: invalid signature/,
    );

    expect(SessionMock.findOne).not.toHaveBeenCalled();
    expect(SessionMock.updateMany).not.toHaveBeenCalled();
  });
});
