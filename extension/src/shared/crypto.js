// 零知识保险箱加密引擎：WebCrypto PBKDF2-SHA256 + AES-256-GCM 认证加密（含 AAD 记录绑定与恢复密钥）

const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 210000;
export const VAULT_HEADER_VERSION = 'mibox.xiaomi.vault/v1';

export function toBase64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(str) {
  const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '==='.slice((b64.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomId(byteLen = 12) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLen)));
}

export function validateMasterPassword(pwd) {
  const s = String(pwd ?? '');
  if (s.length < 8) return '主密码至少需要 8 个字符';
  if (s.length > 128) return '主密码长度不能超过 128 个字符';
  return null;
}

async function deriveWrappingKey(password, saltBytes, iterations = KDF_ITERATIONS) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(String(password)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: saltBytes,
      iterations
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function importMasterKey(rawBytes) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesGcmEncrypt(cryptoKey, plainBytes, aadText) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: enc.encode(String(aadText || ''))
    },
    cryptoKey,
    plainBytes
  );
  return {
    iv: toBase64Url(iv),
    ct: toBase64Url(new Uint8Array(ct))
  };
}

async function aesGcmDecrypt(cryptoKey, box, aadText) {
  const plainBuf = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(box.iv),
      additionalData: enc.encode(String(aadText || ''))
    },
    cryptoKey,
    fromBase64Url(box.ct)
  );
  return new Uint8Array(plainBuf);
}

export function formatRecoveryKey(rawBytes) {
  const hex = Array.from(rawBytes)
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return hex.match(/.{1,8}/g).join('-');
}

export function parseRecoveryKey(formatted) {
  const clean = String(formatted || '').replace(/[^0-9A-Fa-f]/g, '');
  if (clean.length !== 64) throw new Error('恢复密钥格式不正确（应为 64 位十六进制字符）');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * 初始化保险箱头信息：生成随机 256-bit 主密钥与恢复密钥
 */
export async function createVaultHeader(password) {
  const err = validateMasterPassword(password);
  if (err) throw new Error(err);

  const masterRaw = crypto.getRandomValues(new Uint8Array(32));
  const recoveryRaw = crypto.getRandomValues(new Uint8Array(32));
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const pwWrapKey = await deriveWrappingKey(password, salt, KDF_ITERATIONS);
  const recWrapKey = await importMasterKey(recoveryRaw);

  const wrappedByPw = await aesGcmEncrypt(pwWrapKey, masterRaw, `${VAULT_HEADER_VERSION}:pw`);
  const wrappedByRec = await aesGcmEncrypt(recWrapKey, masterRaw, `${VAULT_HEADER_VERSION}:rec`);

  return {
    header: {
      version: VAULT_HEADER_VERSION,
      iterations: KDF_ITERATIONS,
      salt: toBase64Url(salt),
      wrappedByPw,
      wrappedByRec,
      createdAt: Date.now()
    },
    masterKeyBase64: toBase64Url(masterRaw),
    recoveryKeyText: formatRecoveryKey(recoveryRaw)
  };
}

/**
 * 使用主密码解锁保险箱，返回导出的会话主密钥（base64url）
 */
export async function unlockVaultWithPassword(header, password) {
  if (!header || header.version !== VAULT_HEADER_VERSION) {
    throw new Error('保险箱头信息损坏或版本不兼容');
  }
  try {
    const salt = fromBase64Url(header.salt);
    const wrapKey = await deriveWrappingKey(password, salt, header.iterations || KDF_ITERATIONS);
    const masterRaw = await aesGcmDecrypt(wrapKey, header.wrappedByPw, `${VAULT_HEADER_VERSION}:pw`);
    return toBase64Url(masterRaw);
  } catch {
    throw new Error('主密码错误，请核对后重试');
  }
}

/**
 * 使用恢复密钥重置主密码
 */
export async function resetPasswordWithRecoveryKey(header, recoveryKeyText, newPassword) {
  const err = validateMasterPassword(newPassword);
  if (err) throw new Error(err);
  const recRaw = parseRecoveryKey(recoveryKeyText);
  let masterRaw;
  try {
    const recWrapKey = await importMasterKey(recRaw);
    masterRaw = await aesGcmDecrypt(recWrapKey, header.wrappedByRec, `${VAULT_HEADER_VERSION}:rec`);
  } catch {
    throw new Error('恢复密钥无效，无法解开保险箱');
  }
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  const newPwWrapKey = await deriveWrappingKey(newPassword, newSalt, KDF_ITERATIONS);
  const wrappedByPw = await aesGcmEncrypt(newPwWrapKey, masterRaw, `${VAULT_HEADER_VERSION}:pw`);
  return {
    header: {
      ...header,
      iterations: KDF_ITERATIONS,
      salt: toBase64Url(newSalt),
      wrappedByPw,
      updatedAt: Date.now()
    },
    masterKeyBase64: toBase64Url(masterRaw)
  };
}

/**
 * 加密单条保险箱记录（绑定 recordId 作为 AAD 防止密文替换攻击）
 */
export async function encryptVaultItem(masterKeyBase64, recordId, payloadObj) {
  const key = await importMasterKey(fromBase64Url(masterKeyBase64));
  const plainBytes = enc.encode(JSON.stringify(payloadObj));
  const box = await aesGcmEncrypt(key, plainBytes, `item:${recordId}`);
  return {
    id: recordId,
    iv: box.iv,
    ct: box.ct,
    updatedAt: Date.now()
  };
}

/**
 * 解密单条保险箱记录
 */
export async function decryptVaultItem(masterKeyBase64, encryptedRecord) {
  const key = await importMasterKey(fromBase64Url(masterKeyBase64));
  const plainBytes = await aesGcmDecrypt(
    key,
    { iv: encryptedRecord.iv, ct: encryptedRecord.ct },
    `item:${encryptedRecord.id}`
  );
  return JSON.parse(dec.decode(plainBytes));
}
