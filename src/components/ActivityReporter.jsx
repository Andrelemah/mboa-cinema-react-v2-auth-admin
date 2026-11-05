import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { invokeFunction } from '../services/functions.js';

export default function ActivityReporter() {
  const { user, loading, configured } = useAuth();
  const { route } = useApp();
  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    if (!configured || !user || loading) return undefined;
    let sessionId;
    try {
      const key = `mboa.activity.${user.id}`;
      sessionId = sessionStorage.getItem(key);
      if (!/^[0-9a-f-]{36}$/i.test(sessionId || '')) {
        sessionId = crypto.randomUUID();
        sessionStorage.setItem(key, sessionId);
      }
    } catch { sessionId = crypto.randomUUID(); }
    let lastSent = 0;
    let lastDiagnostic = 0;
    let stopped = false;
    let inFlight = false;
    const send = async diagnostic => {
      const now = Date.now();
      if (stopped || inFlight || document.visibilityState !== 'visible') return;
      if (diagnostic ? now - lastDiagnostic < 300000 : now - lastSent < 60000) return;
      if (diagnostic) lastDiagnostic = now;
      else lastSent = now;
      inFlight = true;
      await invokeFunction('activity-heartbeat', { sessionId, route: routeRef.current, ...(diagnostic ? { diagnostic } : {}) });
      inFlight = false;
    };
    const onVisible = () => send();
    const onError = () => send({ code: 'ui_error', component: 'App' });
    send();
    const timer = window.setInterval(onVisible, 60000);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('mboa:ui-error', onError);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('mboa:ui-error', onError);
    };
  }, [configured, user?.id, loading]);
  return null;
}
