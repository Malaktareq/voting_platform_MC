import { useRef, useState } from 'react';
import { useAdmin } from './ui';

/** Lock synchronously, before React renders, so rapid clicks cannot start duplicate writes. */
export function useAction() {
  const locked = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const { toast } = useAdmin();
  const run = async (name: string, action: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true;
    setPending(name);
    try { await action(); }
    catch (error) { toast((error as Error).message, 'err'); }
    finally { locked.current = false; setPending(null); }
  };
  return { pending, busy: pending !== null, run };
}
