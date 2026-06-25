import { describe, it, expect, beforeEach } from "vitest";
import { encrypt, decrypt } from "./session";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-1";
});

describe("encrypt/decrypt", () => {
  it("round-trips a payload", () => {
    const payload = { accessToken: "abc", username: "Someone", expiresAt: 123 };
    expect(decrypt(encrypt(payload))).toEqual(payload);
  });

  it("returns null for a tampered ciphertext", () => {
    const value = encrypt({ a: 1 });
    const tampered = value.slice(0, -2) + (value.slice(-2) === "AA" ? "BB" : "AA");
    expect(decrypt(tampered)).toBeNull();
  });

  it("returns null when decrypted under a different SESSION_SECRET", () => {
    const value = encrypt({ a: 1 });
    process.env.SESSION_SECRET = "test-secret-2";
    expect(decrypt(value)).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(decrypt("not-a-valid-token")).toBeNull();
  });
});
