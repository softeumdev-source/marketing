import crypto from 'crypto';
import { ENCRYPTION_KEY } from './secrets';

const key = Buffer.from(ENCRYPTION_KEY, 'hex');

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [ivb, tagb, datab] = payload.split(':');
  const iv = Buffer.from(ivb, 'base64');
  const tag = Buffer.from(tagb, 'base64');
  const data = Buffer.from(datab, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
