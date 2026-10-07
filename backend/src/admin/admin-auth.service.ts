import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as QRCode from 'qrcode';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { config } from '../config/config';
import { decrypt, encrypt, hashPassword, verifyPassword } from '../common/crypto.util';
import { AppError } from '../common/http-error';
import { generateTotpSecret, otpauthUrl, verifyTotp } from '../common/totp.util';
import { AuthedAdmin } from '../auth/decorators';
import { SessionService } from '../auth/session.service';
import { AuditService } from '../core/audit.service';
import { Admin } from '../database/entities/admin.entity';

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
// Valid-format hash of a random password: keeps login timing identical for unknown users
const DUMMY_HASH = 'scrypt$16384$8$1$c29tZXNhbHRzb21lc2FsdA==$' + Buffer.alloc(64).toString('base64');

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async login(res: Response, ip: string, usernameRaw: string, password: string) {
    const username = String(usernameRaw || '').trim().toLowerCase();
    const a = await this.admins.findOne({ where: { username } });
    if (a?.lockedUntil && a.lockedUntil > new Date()) {
      throw new AppError(423, 'locked', 'Account temporarily locked after failed attempts. Try again later.');
    }
    const ok = await verifyPassword(password, a ? a.passwordHash : DUMMY_HASH);
    if (!a || !ok) {
      if (a) {
        a.failedLogins += 1;
        if (a.failedLogins >= LOCK_AFTER) a.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
        await this.admins.save(a);
      }
      await this.audit.record(`admin:${username || '?'}`, 'login_failed', {}, ip);
      throw new AppError(401, 'bad_credentials', 'Incorrect username or password.');
    }
    if (a.totpEnabled) {
      const payload = { sub: a.id, typ: 'admin_pending' as const, tv: SessionService.tokenVersion(a.passwordHash) };
      const mfaToken = this.sessions.sign(payload, '5m');
      this.sessions.set(res, 'mc_ap', payload, '5m');
      return { mfaRequired: true, mfaToken };
    }
    const accessToken = await this.complete(res, ip, a);
    return { ok: true, accessToken, mfaSetupRecommended: true };
  }

  async loginMfa(res: Response, ip: string, pending: { sub?: string | number; tv?: string } | null, code: string) {
    if (!pending) throw new AppError(401, 'mfa_expired', 'Please sign in again.');
    const a = await this.admins.findOne({ where: { id: Number(pending.sub) } });
    if (!a || !a.totpEnabled || !a.totpSecretEnc || SessionService.tokenVersion(a.passwordHash) !== pending.tv) throw new AppError(401, 'mfa_expired', 'Please sign in again.');
    if (!verifyTotp(decrypt(a.totpSecretEnc), String(code || '').trim())) {
      a.failedLogins += 1;
      await this.admins.save(a);
      await this.audit.record(`admin:${a.username}`, 'mfa_failed', {}, ip);
      throw new AppError(401, 'bad_code', 'Incorrect authenticator code.');
    }
    this.sessions.clear(res, 'mc_ap');
    const accessToken = await this.complete(res, ip, a);
    return { ok: true, accessToken };
  }

  private async complete(res: Response, ip: string, a: Admin) {
    a.failedLogins = 0;
    a.lockedUntil = null;
    a.lastLoginAt = new Date();
    await this.admins.save(a);
    const payload = { sub: a.id, typ: 'admin' as const, role: a.role, tv: SessionService.tokenVersion(a.passwordHash) };
    const accessToken = this.sessions.sign(payload, config.sessions.adminTtl);
    this.sessions.set(res, 'mc_a', payload, config.sessions.adminTtl);
    await this.audit.record(`admin:${a.username}`, 'login', { mfa: a.totpEnabled }, ip);
    return accessToken;
  }

  async changePassword(res: Response, ip: string, admin: AuthedAdmin, current: string, next: string) {
    if (typeof next !== 'string' || next.length < 10) throw new AppError(400, 'weak_password', 'New password must be at least 10 characters.');
    const row = await this.admins.findOneByOrFail({ id: admin.id });
    if (!(await verifyPassword(String(current || ''), row.passwordHash))) throw new AppError(401, 'bad_credentials', 'Current password is incorrect.');
    const hash = await hashPassword(next);
    row.passwordHash = hash;
    await this.admins.save(row);
    // New token version -> every other session is revoked; keep this one alive
    const payload = { sub: admin.id, typ: 'admin' as const, role: admin.role, tv: SessionService.tokenVersion(hash) };
    const accessToken = this.sessions.sign(payload, config.sessions.adminTtl);
    this.sessions.set(res, 'mc_a', payload, config.sessions.adminTtl);
    await this.audit.record(`admin:${admin.username}`, 'password_changed', {}, ip);
    return { ok: true, accessToken };
  }

  async mfaSetup(admin: AuthedAdmin) {
    if (admin.totp_enabled) throw new AppError(400, 'mfa_already_enabled', 'MFA is already enabled.');
    const secret = generateTotpSecret();
    await this.admins.update({ id: admin.id }, { totpSecretEnc: encrypt(secret) });
    const url = otpauthUrl(secret, admin.username);
    return { secret, otpauth: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) };
  }

  async mfaEnable(ip: string, admin: AuthedAdmin, code: string) {
    const row = await this.admins.findOneByOrFail({ id: admin.id });
    if (!row.totpSecretEnc) throw new AppError(400, 'mfa_not_setup', 'Start MFA setup first.');
    if (!verifyTotp(decrypt(row.totpSecretEnc), String(code || '').trim())) throw new AppError(400, 'bad_code', 'Incorrect code — check your authenticator app and try again.');
    row.totpEnabled = true;
    await this.admins.save(row);
    await this.audit.record(`admin:${admin.username}`, 'mfa_enabled', {}, ip);
    return { ok: true };
  }

  async mfaDisable(ip: string, admin: AuthedAdmin, password: string, code: string) {
    const a = await this.admins.findOneByOrFail({ id: admin.id });
    if (!a.totpEnabled || !a.totpSecretEnc) throw new AppError(400, 'mfa_not_enabled', 'MFA is not enabled.');
    if (!(await verifyPassword(String(password || ''), a.passwordHash)) || !verifyTotp(decrypt(a.totpSecretEnc), String(code || '').trim())) {
      throw new AppError(401, 'bad_credentials', 'Password or code incorrect.');
    }
    a.totpEnabled = false;
    a.totpSecretEnc = null;
    await this.admins.save(a);
    await this.audit.record(`admin:${admin.username}`, 'mfa_disabled', {}, ip);
    return { ok: true };
  }

  listUsers() {
    return this.admins.createQueryBuilder('admin')
      .select([
        'admin.id AS id',
        'admin.username AS username',
        'admin.role AS role',
        'admin.totpEnabled AS totp_enabled',
        'admin.lastLoginAt AS last_login_at',
        'admin.createdAt AS created_at',
      ])
      .orderBy('admin.id', 'ASC')
      .getRawMany();
  }

  async createUser(ip: string, actor: AuthedAdmin, usernameRaw: string, password: string, roleRaw?: string) {
    const username = String(usernameRaw || '').trim().toLowerCase();
    const role = roleRaw === 'viewer' ? 'viewer' : 'admin';
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new AppError(400, 'bad_username', 'Username: 3–32 letters, digits, . _ -');
    if (String(password).length < 10) throw new AppError(400, 'weak_password', 'Password must be at least 10 characters.');
    try {
      const created = await this.admins.save(this.admins.create({ username, passwordHash: await hashPassword(password), role }));
      await this.audit.record(`admin:${actor.username}`, 'user_created', { username, role }, ip);
      return { id: created.id };
    } catch (e: any) {
      if (e.code === '23505') throw new AppError(409, 'exists', 'That username is taken.');
      throw e;
    }
  }

  async deleteUser(ip: string, actor: AuthedAdmin, id: number) {
    if (id === actor.id) throw new AppError(400, 'self', 'You cannot delete your own account.');
    await this.admins.delete({ id });
    await this.audit.record(`admin:${actor.username}`, 'user_deleted', { id }, ip);
    return { ok: true };
  }
}
