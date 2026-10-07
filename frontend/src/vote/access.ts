import { api } from '../lib/api';
import type { GeoPoint, PublicState, VisitorSession } from '../lib/types';

export function registrationGate(data: PublicState, onSite: boolean, session: VisitorSession | null) {
  // Verified visitors do not need a new QR grant; protected vote requests still check access.
  if (session) return null;
  if (data.qrEntryRequired && !data.qrEntryAllowed) return 'qr';
  if (!onSite) return 'offsite';
  return null;
}

export const checkLocation = (location: GeoPoint) => api<PublicState['access']>(
  '/api/public/access-check', { method: 'POST', body: { location } },
);
