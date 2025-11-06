import { useCallback, useEffect, useRef, useState } from "react";
import { resolveApiUrl } from "../config";
import type { ServerHealth } from "../types";

export type ServerStatus = "checking" | "online" | "offline";

interface ServerStatusState {
  status: ServerStatus;
  health: ServerHealth | null;
  error: string | null;
  lastChecked: string | null;
  isChecking: boolean;
}

const DEFAULT_POLL_INTERVAL = 30_000;

export const useServerStatus = (pollInterval = DEFAULT_POLL_INTERVAL) => {
  const [state, setState] = useState<ServerStatusState>({
    status: "checking",
    health: null,
    error: null,
    lastChecked: null,
    isChecking: true,
  });
  const abortRef = useRef<AbortController | null>(null);

  const checkStatus = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      ...prev,
      status: "checking",
      isChecking: true,
      error: prev.status === "offline" ? null : prev.error,
    }));

    try {
      const response = await fetch(resolveApiUrl("/api/health"), {
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await response.text();
        let detail = message;
        try {
          const parsed = JSON.parse(message) as { detail?: string };
          if (parsed && typeof parsed.detail === "string") {
            detail = parsed.detail;
          }
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(detail || "Health check failed.");
      }

      const payload = (await response.json()) as ServerHealth;

      setState({
        status: "online",
        health: payload,
        error: null,
        lastChecked: new Date().toISOString(),
        isChecking: false,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }

      const message = err instanceof Error ? err.message : "Unknown error.";
      setState((prev) => ({
        ...prev,
        status: "offline",
        error: message,
        health: null,
        lastChecked: new Date().toISOString(),
        isChecking: false,
      }));
    } finally {
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    void checkStatus();

    if (pollInterval <= 0) {
      return () => {
        abortRef.current?.abort();
        abortRef.current = null;
      };
    }

    const id = window.setInterval(() => {
      void checkStatus();
    }, pollInterval);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [checkStatus, pollInterval]);

  return {
    ...state,
    checkStatus,
  };
};

export default useServerStatus;
