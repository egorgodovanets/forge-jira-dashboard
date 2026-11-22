import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

/**
 * Calls a Forge resolver and tracks { data, error, loading }.
 * Re-runs whenever functionKey or the payload content changes.
 */
export function useInvoke(functionKey, payload) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  // A new payload object is created on every render, so compare by content.
  const payloadKey = JSON.stringify(payload ?? {});

  useEffect(() => {
    // Set to true when a newer request starts or the component unmounts,
    // so a late response can't overwrite fresher data.
    let ignore = false;

    // Keep the previous data while loading, so the UI doesn't flicker.
    setState((prev) => ({ ...prev, error: null, loading: true }));

    invoke(functionKey, JSON.parse(payloadKey))
      .then((data) => {
        if (!ignore) setState({ data, error: null, loading: false });
      })
      .catch((err) => {
        console.error(`${functionKey} failed`, err);
        if (!ignore) setState({ data: null, error: err?.message ?? String(err), loading: false });
      });

    return () => {
      ignore = true;
    };
  }, [functionKey, payloadKey]);

  return state;
}
