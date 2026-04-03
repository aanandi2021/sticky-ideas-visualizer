import { useEffect, useRef, useState, useCallback } from 'react';
import type { TreeNode, ClusterSnapshot } from '@shared/types';

interface ClustersData {
  treeData: TreeNode;
  snapshot: ClusterSnapshot | null;
}

/**
 * Real-time connection hook.
 * Tries SSE first (local dev server), falls back to SignalR (Azure).
 */
export function useSignalR() {
  const [connected, setConnected] = useState(false);
  const callbackRef = useRef<((data: ClustersData) => void) | null>(null);

  const onUpdate = useCallback((callback: (data: ClustersData) => void) => {
    callbackRef.current = callback;
  }, []);

  useEffect(() => {
    // Try SSE first (local dev server)
    const sse = new EventSource('/api/sse');
    let sseWorked = false;

    sse.onopen = () => {
      sseWorked = true;
      setConnected(true);
    };

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') {
          setConnected(true);
          return;
        }
        if (data.type === 'clustersUpdated') {
          const update: ClustersData = { treeData: data.treeData, snapshot: data.snapshot };
          callbackRef.current?.(update);
        }
      } catch { /* ignore */ }
    };

    sse.onerror = () => {
      sse.close();
      if (!sseWorked) {
        // SSE not available — try SignalR (Azure environment)
        trySignalR();
      } else {
        setConnected(false);
      }
    };

    async function trySignalR() {
      try {
        const signalR = await import('@microsoft/signalr');
        const connection = new signalR.HubConnectionBuilder()
          .withUrl('/api')
          .withAutomaticReconnect()
          .configureLogging(signalR.LogLevel.Warning)
          .build();

        connection.on('clustersUpdated', (data: ClustersData) => {
          callbackRef.current?.(data);
        });
        connection.onreconnecting(() => setConnected(false));
        connection.onreconnected(() => setConnected(true));
        connection.onclose(() => setConnected(false));

        await connection.start();
        setConnected(true);
      } catch {
        console.warn('Running in offline mode — no real-time connection');
        setConnected(false);
      }
    }

    return () => { sse.close(); };
  }, []);

  return { connected, lastUpdate: null, onUpdate };
}
