import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as QRCode from 'qrcode';
import { isISO8601 } from 'class-validator';
import { config } from '../config/config';
import { buildBlockList, validGeofence } from '../common/geo.util';
import { AppError } from '../common/http-error';
import { AuditService } from '../core/audit.service';
import { SettingsService } from '../settings/settings.service';
import { AllSettings } from '../settings/settings.types';
import { VoteQrService } from '../core/vote-qr.service';
import { AccessSettingsDto, DisplaySettingsDto, EventSettingsDto, VotingSettingsDto } from './admin.dto';

/** Voting window (F10), on-site rules (F11), event details and display key. */
@Injectable()
export class EventService {
  constructor(private readonly settings: SettingsService, private readonly audit: AuditService, private readonly voteQr: VoteQrService) {}

  async get(ip: string) {
    const s = await this.settings.getAll(true);
    return { settings: s, voting: this.settings.votingState(s), clientIp: ip };
  }

  async updateEvent(actor: string, ip: string, b: EventSettingsDto) {
    return this.save(actor, ip, 'event', {
      name: String(b.name || '').trim().slice(0, 80) || 'MC2026 Community Awards',
      tagline: String(b.tagline || '').trim(),
      venue: String(b.venue || '').trim(),
    });
  }

  async updateVoting(actor: string, ip: string, b: VotingSettingsDto) {
    const iso = (v?: string | null) => {
      if (v === null) return null;
      if (typeof v !== 'string' || !isISO8601(v, { strict: true, strictSeparator: true }) ||
          !/T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)) {
        throw new AppError(400, 'bad_date', 'Schedule dates must be valid ISO timestamps with a timezone offset.');
      }
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) throw new AppError(400, 'bad_date', 'Invalid date.');
      return d.toISOString();
    };
    const patch: Partial<AllSettings['voting']> = {};
    if (b.open !== undefined) patch.open = !!b.open;
    if (b.opens_at !== undefined) patch.opens_at = iso(b.opens_at);
    if (b.closes_at !== undefined) patch.closes_at = iso(b.closes_at);
    return this.save(actor, ip, 'voting', patch);
  }

  async updateAccess(actor: string, ip: string, b: AccessSettingsDto) {
    const patch: Partial<AllSettings['access']> = {};
    if (b.mode) patch.mode = b.mode;
    if (b.allowed_cidrs) {
      const list = b.allowed_cidrs.map((x) => String(x).trim()).filter(Boolean);
      const { invalid } = buildBlockList(list);
      if (invalid.length) throw new AppError(400, 'bad_cidr', `Invalid IP range(s): ${invalid.join(', ')}`);
      patch.allowed_cidrs = list;
    }
    if (b.geofence) {
      const g = { lat: b.geofence.lat, lng: b.geofence.lng, radius_m: b.geofence.radius_m,
        max_accuracy_m: b.geofence.max_accuracy_m === undefined ? 500 : b.geofence.max_accuracy_m };
      if (!validGeofence(g)) {
        throw new AppError(400, 'bad_geofence', 'Check the geofence latitude, longitude, radius (10–50,000 m) and nonnegative accuracy limit.');
      }
      patch.geofence = g;
    }
    return this.save(actor, ip, 'access', patch);
  }

  async updateDisplay(actor: string, ip: string, b: DisplaySettingsDto) {
    return this.save(actor, ip, 'display', b.show_counts !== undefined ? { show_counts: !!b.show_counts } : {});
  }

  async rotateDisplayKey(actor: string, ip: string) {
    await this.settings.update('display', { key: crypto.randomBytes(18).toString('base64url') },
      manager => this.audit.record(actor, 'display_key_rotated', {}, ip, manager));
    return { ok: true };
  }

  async links(isAdmin: boolean) {
    const s = await this.settings.getAll(true);
    const base = config.publicUrl.replace(/\/$/, '');
    const qr = this.voteQr.issue();
    const voteUrl = `${base}/`;
    const qrUrl = `${voteUrl}#entry=${encodeURIComponent(qr.token)}`;
    return {
      voteUrl,
      displayUrl: isAdmin ? `${base}/display?key=${encodeURIComponent(s.display.key || '')}` : null,
      voteQr: await QRCode.toDataURL(qrUrl, { margin: 1, width: 480, errorCorrectionLevel: 'M' }),
      voteQrRefreshAt: qr.refreshAt,
    };
  }

  private async save<K extends keyof AllSettings>(actor: string, ip: string, key: K, patch: Partial<AllSettings[K]>) {
    const value = await this.settings.update(key, patch,
      manager => this.audit.record(actor, 'settings_updated', { key, patch }, ip, manager));
    return { ok: true, value };
  }
}
