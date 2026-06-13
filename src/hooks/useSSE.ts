import { useEffect, useRef, useState, useCallback } from 'react';
import type { RepairProgress } from '@/types';

export function useSSE(
  taskId: string | null,
  onProgress?: (progress: RepairProgress) => void
) {
  const [progress, setProgress] = useState<RepairProgress | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!taskId) {
      setProgress(null);
      setIsConnected(false);
      return;
    }

    setError(null);
    setIsConnected(true);

    const eventSource = new EventSource(`/api/repair/${taskId}/progress`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as RepairProgress;
        setProgress(data);
        onProgress?.(data);

        if (data.stage === 'completed' || data.stage === 'error') {
          disconnect();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
        setError(e instanceof Error ? e : new Error('解析SSE数据失败'));
      }
    };

    eventSource.onerror = (e) => {
      console.error('SSE error:', e);
      setError(new Error('SSE连接错误'));
      disconnect();
    };

    cleanupRef.current = () => {
      eventSource.close();
    };

    return () => {
      disconnect();
    };
  }, [taskId, onProgress, disconnect]);

  return {
    progress,
    isConnected,
    error,
    disconnect,
  };
}
