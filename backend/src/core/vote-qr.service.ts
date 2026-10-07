import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { config } from '../config/config';
import { safeEqual } from '../common/crypto.util';

/** Short-lived signed QR entries; grants are bound to the scanning device's IP. */
@Injectable()
export class VoteQrService {
  private readonly periodMs = config.voteQr.rotateSeconds * 1000;

  issue(now = Date.now()) {
    const bucket = Math.floor(now / this.periodMs);
    const signature = this.signBucket(bucket);
    return { token: `v1.${bucket}.${signature}`, refreshAt: (bucket + 1) * this.periodMs };
  }

  isValid(token: string, now = Date.now()) {
    const [version, bucketText, signature, extra] = String(token || '').split('.');
    if (version !== 'v1' || !bucketText || !signature || extra !== undefined) return false;
    const bucket = Number(bucketText);
    const current = Math.floor(now / this.periodMs);
    // Keep the current and previous code valid for scan/load latency.
    if (!Number.isSafeInteger(bucket) || bucket > current || current - bucket > 1) return false;
    return safeEqual(signature, this.signBucket(bucket));
  }

  ipBinding(ip: string) {
    return crypto.createHmac('sha256', config.keys.voteQr).update(`ip:${ip}`).digest('base64url');
  }

  private signBucket(bucket: number) {
    return crypto.createHmac('sha256', config.keys.voteQr).update(`vote-entry:${bucket}`).digest('base64url').slice(0, 22);
  }
}
