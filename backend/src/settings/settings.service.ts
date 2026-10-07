import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource } from 'typeorm';
import { BusService } from '../redis/bus.service';
import { AllSettings, SettingsKey, VotingState } from './settings.types';

/**
 * Defaults are written to the DB on first boot; from then on the DB is the
 * source of truth and admins change everything from the admin console.
 */
export const DEFAULT_SETTINGS: AllSettings = {
  event: { name: 'MC2026 Community Awards', tagline: 'Vote for your favourite makers', venue: '' },
  // Event times remain unset until supplied in Asia/Amman, then stored as ISO instants.
  voting: { open: false, opens_at: null, closes_at: null },
  access: {
    mode: 'ip_and_geo',
    allowed_cidrs: [],
    // Unknown venue values are placeholders, not attendance checks for a real venue.
    geofence: { lat: null, lng: null, radius_m: null, max_accuracy_m: null },
  },
  display: { key: null, show_counts: true },
};

@Injectable()
export class SettingsService {
  private cache: AllSettings | null = null;
  private cacheAt = 0;
  private static readonly TTL = 5000;

  constructor(private readonly ds: DataSource, private readonly bus: BusService) {
    // Other replicas drop their cache as soon as anyone changes settings
    this.bus.on('settings', () => { this.cache = null; });
  }

  async ensureDefaults() {
    for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
      const val = k === 'display' ? { ...v, key: crypto.randomBytes(18).toString('base64url') } : v;
      await this.ds.query('INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, val]);
    }
  }

  async getAll(force = false): Promise<AllSettings> {
    if (!force && this.cache && Date.now() - this.cacheAt < SettingsService.TTL) return this.cache;
    const rows: { key: SettingsKey; value: any }[] = await this.ds.query('SELECT key, value FROM settings');
    const out = structuredClone(DEFAULT_SETTINGS) as any;
    for (const r of rows) out[r.key] = { ...(out[r.key] || {}), ...r.value };
    this.cache = out; this.cacheAt = Date.now();
    return out;
  }

  async update<K extends SettingsKey>(key: K, patch: Partial<AllSettings[K]>): Promise<AllSettings[K]> {
    if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown settings key ${key}`);
    const current = (await this.getAll(true))[key];
    const next = { ...current, ...patch };
    await this.ds.query(
      `INSERT INTO settings(key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, next],
    );
    this.cache = null;
    await this.bus.publish('settings', { key });
    return next;
  }

  votingState(s: AllSettings): VotingState {
    const v = s.voting;
    const now = Date.now();
    if (!v.open) return { open: false, reason: 'closed' };
    if (v.opens_at && now < Date.parse(v.opens_at)) return { open: false, reason: 'not_started', opens_at: v.opens_at };
    if (v.closes_at && now >= Date.parse(v.closes_at)) return { open: false, reason: 'ended', closes_at: v.closes_at };
    return { open: true, closes_at: v.closes_at };
  }
}
