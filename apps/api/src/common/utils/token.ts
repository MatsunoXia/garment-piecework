import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/** 随机不透明令牌（邀请链接、重新绑定令牌等） */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** 只保存令牌哈希，数据库泄露时无法还原原始令牌 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 生成易读的邀请码，排除 0/O/1/I 等易混淆字符 */
export function randomInviteCode(length = 8): string {
  let code = '';
  for (let index = 0; index < length; index += 1) {
    code += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
  }
  return code;
}

const SCRYPT_PREFIX = 'scrypt';

/** Web 管理控制台密码哈希（scrypt + 随机盐） */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${SCRYPT_PREFIX}$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expected] = stored.split('$');
  if (algorithm !== SCRYPT_PREFIX || !salt || !expected) return false;
  const derived = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (derived.length !== expectedBuffer.length) return false;
  return timingSafeEqual(derived, expectedBuffer);
}

/** 生成随机 UUID（数据库主键由应用生成，避免依赖数据库扩展） */
export function newId(): string {
  return randomUUID();
}
