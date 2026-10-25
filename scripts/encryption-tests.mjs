import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { decryptParticipantData, dataEncryptionConfigured, encryptParticipantData } from "../netlify/functions/encryption-lib.mts";

const keyV1 = Buffer.alloc(32, 17).toString("base64url");
const keyV2 = Buffer.alloc(32, 23).toString("base64url");
process.env.HERCULES_DATA_ENCRYPTION_KEY_V1 = keyV1;
process.env.HERCULES_DATA_ENCRYPTION_KEY_V2 = keyV2;
process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION = "1";

const profileId = randomUUID();
const payload = { email: "participant@example.test", health: { restrictions: ["test"] } };
assert.equal(dataEncryptionConfigured(), true);
const encrypted = encryptParticipantData(payload, { purpose: "onboarding", profileId });
assert.equal(encrypted.keyVersion, 1);
assert.notEqual(encrypted.ciphertext.toString("utf8"), JSON.stringify(payload));
assert.deepEqual(decryptParticipantData(encrypted.ciphertext, encrypted.keyVersion, { purpose: "onboarding", profileId }), payload);
assert.throws(() => decryptParticipantData(encrypted.ciphertext, 1, { purpose: "plan", profileId }), /Unsupported state|auth/i, "ciphertext must be bound to its data purpose");
assert.throws(() => decryptParticipantData(encrypted.ciphertext, 1, { purpose: "onboarding", profileId: randomUUID() }), /Unsupported state|auth/i, "ciphertext must be bound to its profile");

process.env.HERCULES_DATA_ENCRYPTION_CURRENT_VERSION = "2";
const next = encryptParticipantData(payload, { purpose: "onboarding", profileId });
assert.equal(next.keyVersion, 2, "encryption uses the configured current key version");
assert.deepEqual(decryptParticipantData(encrypted.ciphertext, 1, { purpose: "onboarding", profileId }), payload, "older keys remain available for decryption during rotation");

delete process.env.HERCULES_DATA_ENCRYPTION_KEY_V2;
assert.equal(dataEncryptionConfigured(), false, "readiness fails closed when the active key is unavailable");
assert.throws(() => encryptParticipantData(payload, { purpose: "onboarding", profileId }), /unavailable/i);
console.log("Participant-data encryption checks passed: AES-256-GCM, tamper/context rejection, versioned rotation, and fail-closed key readiness.");
