const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string) {
  let binary = "";
  try {
    binary = atob(value);
  } catch {
    throw new Error("Invalid base64 input.");
  }
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
}

function toBase64(value: Uint8Array) {
  let binary = "";
  for (let i = 0; i < value.length; i += 1) {
    binary += String.fromCharCode(value[i]);
  }
  return btoa(binary);
}

async function importAesKey(secretBase64: string) {
  const raw = fromBase64(secretBase64);
  if (raw.length !== 32) {
    throw new Error("BANK_FEED_TOKEN_KEY must be a base64-encoded 32-byte key.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plainText: string, secretBase64: string) {
  const key = await importAesKey(secretBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plainText));
  return {
    iv: toBase64(iv),
    cipherText: toBase64(new Uint8Array(encrypted))
  };
}

export async function decryptSecret(cipherText: string, iv: string, secretBase64: string) {
  const key = await importAesKey(secretBase64);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, key, fromBase64(cipherText));
  return decoder.decode(decrypted);
}
