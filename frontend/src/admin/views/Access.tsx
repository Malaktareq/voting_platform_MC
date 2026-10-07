import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Settings } from '../../lib/types';
import { getLocation } from '../../lib/util';
import { LoadError, PageHead, Spinner, useAdmin, useLoad } from '../ui';

const MODES: [string, string, string][] = [
  ['ip_or_geo', 'Venue Wi-Fi OR location', 'Recommended. Wi-Fi users pass instantly; mobile-data users share their location.'],
  ['ip', 'Venue Wi-Fi only', 'Strictest. Only requests from the listed IP ranges can vote.'],
  ['geo', 'Location only', 'Browser location must be inside the geofence.'],
  ['ip_and_geo', 'Wi-Fi AND location', 'Both checks must pass.'],
  ['off', 'Off (testing only)', 'Anyone anywhere can vote — never use during the event.'],
];

/** On-site access control (F11) and event details. */
export default function Access() {
  const { isAdmin, toast } = useAdmin();
  const { data, error } = useLoad(() => api<{ settings: Settings; clientIp: string }>('/api/admin/settings'));
  const [mode, setMode] = useState('ip_or_geo');
  const [cidrs, setCidrs] = useState('');
  const [geo, setGeo] = useState({ lat: '', lng: '', radius_m: '', max_accuracy_m: '' });
  const [ev, setEv] = useState({ name: '', tagline: '', venue: '' });
  const [showCounts, setShowCounts] = useState(true);

  useEffect(() => {
    if (!data) return;
    const s = data.settings;
    setMode(s.access.mode);
    setCidrs(s.access.allowed_cidrs.join('\n'));
    const g = s.access.geofence;
    setGeo({ lat: String(g.lat ?? ''), lng: String(g.lng ?? ''), radius_m: String(g.radius_m ?? ''), max_accuracy_m: String(g.max_accuracy_m ?? 500) });
    setEv({ name: s.event.name, tagline: s.event.tagline, venue: s.event.venue });
    setShowCounts(s.display.show_counts !== false);
  }, [data]);

  if (error) return <LoadError error={error} />;
  if (!data) return <Spinner />;
  const dis = !isAdmin;
  const mapHref = `https://www.openstreetmap.org/?mlat=${geo.lat}&mlon=${geo.lng}#map=17/${geo.lat}/${geo.lng}`;

  const saveAccess = async () => {
    try {
      await api('/api/admin/settings/access', { method: 'PUT', body: {
        mode, allowed_cidrs: cidrs.split(/[\s,]+/).filter(Boolean),
        geofence: { lat: Number(geo.lat), lng: Number(geo.lng), radius_m: Number(geo.radius_m), max_accuracy_m: Number(geo.max_accuracy_m) },
      } });
      toast('Access rules saved — active immediately');
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const saveEvent = async () => {
    try {
      await api('/api/admin/settings/event', { method: 'PUT', body: ev });
      await api('/api/admin/settings/display', { method: 'PUT', body: { show_counts: showCounts } });
      toast('Event details saved');
    } catch (e) { toast((e as Error).message, 'err'); }
  };
  const useMine = async () => {
    try {
      const l = await getLocation();
      setGeo({ ...geo, lat: l.lat.toFixed(6), lng: l.lng.toFixed(6) });
      toast(`Location set (±${Math.round(l.accuracy)} m)`);
    } catch { toast('Could not get your location', 'err'); }
  };
  const ip = data.clientIp;

  return (
    <div>
      <PageHead title="Event & access" sub="Everything here is stored in the database and applies instantly on every server." />
      <form className="card" onSubmit={(e) => { e.preventDefault(); if (e.currentTarget.reportValidity()) void saveAccess(); }}>
        <div className="card-head"><h2>On-site access control</h2></div>
        <p className="muted">Voting is only accepted from people physically at the venue. Combine the venue network’s IP range with a GPS geofence.</p>
        <div className="modes">
          {MODES.map(([id, label, desc]) => (
            <label key={id} className={`mode${id === 'off' ? ' warn' : ''}`}>
              <input type="radio" name="mode" value={id} checked={mode === id} disabled={dis} onChange={() => setMode(id)} />
              <div><b>{label}</b><span>{desc}</span></div>
            </label>
          ))}
        </div>
        <div className="grid2 top">
          <div className="stack tight">
            <label className="field"><span>Allowed IP ranges (CIDR, one per line)</span>
              <textarea className="input mono" rows={5} disabled={dis} value={cidrs} onChange={(e) => setCidrs(e.target.value)} /></label>
            <p className="muted small">Use the venue Wi-Fi’s public IP (as seen by the server), e.g. 37.220.1.0/24. Private ranges only work when the server is on the venue LAN.</p>
            <div className="ipnote">Your IP as seen by the server: <code>{ip}</code>
              {!dis && <button type="button" className="btn btn-sm" onClick={() => setCidrs(`${cidrs.trim()}\n${ip}${ip.includes(':') ? '/128' : '/32'}`.trim())}>Add my IP</button>}
            </div>
          </div>
          <div className="stack tight">
            <div className="grid2">
              <label className="field"><span>Venue latitude</span><input className="input" type="number" min={-90} max={90} step="any" required disabled={dis} value={geo.lat} onChange={(e) => setGeo({ ...geo, lat: e.target.value })} /></label>
              <label className="field"><span>Venue longitude</span><input className="input" type="number" min={-180} max={180} step="any" required disabled={dis} value={geo.lng} onChange={(e) => setGeo({ ...geo, lng: e.target.value })} /></label>
              <label className="field"><span>Radius (metres)</span><input className="input" type="number" min={10} max={50000} step={1} required disabled={dis} value={geo.radius_m} onChange={(e) => setGeo({ ...geo, radius_m: e.target.value })} /></label>
              <label className="field"><span>Max GPS inaccuracy (m)</span><input className="input" type="number" min={0} step="any" required disabled={dis} value={geo.max_accuracy_m} onChange={(e) => setGeo({ ...geo, max_accuracy_m: e.target.value })} /></label>
            </div>
            <div className="actions">
              {!dis && <button type="button" className="btn btn-sm" onClick={useMine}>Use my current location</button>}
              <a className="btn btn-sm" target="_blank" rel="noopener" href={mapHref}>Preview on map ↗</a>
            </div>
          </div>
        </div>
        {!dis && <div className="actions end"><button type="submit" className="btn btn-primary">Save access rules</button></div>}
      </form>

      <form className="card" onSubmit={(e) => { e.preventDefault(); if (e.currentTarget.reportValidity()) void saveEvent(); }}>
        <div className="card-head"><h2>Event details</h2></div>
        <div className="grid3">
          <label className="field"><span>Event / awards name</span><input className="input" required maxLength={80} pattern=".*\S.*" disabled={dis} value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })} /></label>
          <label className="field"><span>Tagline</span><input className="input" maxLength={120} disabled={dis} value={ev.tagline} onChange={(e) => setEv({ ...ev, tagline: e.target.value })} /></label>
          <label className="field"><span>Venue</span><input className="input" maxLength={120} disabled={dis} value={ev.venue} onChange={(e) => setEv({ ...ev, venue: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" disabled={dis} checked={showCounts} onChange={(e) => setShowCounts(e.target.checked)} /><span>Show vote counts on the live screen (untick to show ranking bars only)</span></label>
        {!dis && <div className="actions end"><button type="submit" className="btn btn-primary">Save event details</button></div>}
      </form>
    </div>
  );
}
