import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AppError } from '../common/http-error';
import { config } from '../config/config';
import { BusService } from '../redis/bus.service';
import { AllSettings, SettingsKey, VotingState } from './settings.types';

/**
 * Defaults are written to the DB on first boot; from then on the DB is the
 * source of truth and admins change everything from the admin console.
 */
export const DEFAULT_SETTINGS: AllSettings = {
  event: { name: 'MC2026 Community Awards', tagline: 'Vote for your favourite makers', venue: '', public_url: '' },
  // Event times remain unset until supplied in Asia/Amman, then stored as ISO instants.
  voting: { open: false, opens_at: null, closes_at: null },
  access: {
    mode: 'ip_and_geo',
    allowed_cidrs: [],
    // Unknown venue values are placeholders, not attendance checks for a real venue.
    geofence: { lat: null, lng: null, radius_m: null, max_accuracy_m: null },
  },
  // show_winners: the results screen announces winners (set by the admin after closing voting)
  display: { key: null, show_counts: true, show_winners: false },
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
    await this.ds.transaction(async manager => {
      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        const val = k === 'display' ? { ...v, key: crypto.randomBytes(18).toString('base64url') } : v;
        await manager.query('INSERT INTO settings(key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, val]);
      }
    });
  }

  async getAll(force = false): Promise<AllSettings> {
    if (!force && this.cache && Date.now() - this.cacheAt < SettingsService.TTL) return this.cache;
    const rows: { key: SettingsKey; value: any }[] = await this.ds.query('SELECT key, value FROM settings');
    const out = structuredClone(DEFAULT_SETTINGS) as any;
    for (const r of rows) out[r.key] = { ...(out[r.key] || {}), ...r.value };
    this.cache = out; this.cacheAt = Date.now();
    return out;
  }

  async update<K extends SettingsKey>(key: K, patch: Partial<AllSettings[K]>,
    audit?: (manager: EntityManager) => Promise<void>): Promise<AllSettings[K]> {
    const values = await this.updateMany({ [key]: patch }, audit);
    return values[key]!;
  }

  async updateMany(patches: { [K in SettingsKey]?: Partial<AllSettings[K]> },
    audit?: (manager: EntityManager) => Promise<void>): Promise<Partial<AllSettings>> {
    for (const key of Object.keys(patches)) {
      if (!(key in DEFAULT_SETTINGS)) throw new Error(`unknown settings key ${key}`);
    }
    // Voting precedes display, matching reset's row-lock order.
    const keys = (Object.keys(DEFAULT_SETTINGS) as SettingsKey[]).filter(key => patches[key] !== undefined);
    const values = await this.ds.transaction(async manager => {
      const values: Partial<AllSettings> = {};
      for (const key of keys) {
        // Lock even when a default row is absent; concurrent patches merge with the latest row.
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`settings:${key}`]);
        const rows = await manager.query('SELECT value FROM settings WHERE key = $1 FOR UPDATE', [key]);
        const next = { ...DEFAULT_SETTINGS[key], ...rows[0]?.value, ...patches[key] };
        if (key === 'voting' && next.opens_at && next.closes_at && Date.parse(next.closes_at) <= Date.parse(next.opens_at)) {
          throw new AppError(400, 'bad_voting_window', 'Voting end must be after voting start.');
        }
        await manager.query(
          `INSERT INTO settings(key, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
          [key, next],
        );
        Object.assign(values, { [key]: next });
      }
      if (audit) await audit(manager);
      return values;
    });
    this.cache = null;
    for (const key of keys) await this.bus.publish('settings', { key });
    return values;
  }

  /** Address visitors' phones open (QR code, shared links): the admin's setting, else PUBLIC_URL. No trailing slash. */
  async publicBase(): Promise<string> {
    const s = await this.getAll();
    return (s.event.public_url || config.publicUrl).replace(/\/+$/, '');
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
