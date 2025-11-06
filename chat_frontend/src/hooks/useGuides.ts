import { useCallback, useEffect, useRef, useState } from "react";
import { resolveApiUrl } from "../config";
import type { GuideSummary } from "../types";

interface GuideListState {
  guides: GuideSummary[];
  isLoading: boolean;
  error: string | null;
}

const normalizeGuides = (guides: GuideSummary[]): GuideSummary[] =>
  guides
    .filter(
      (guide) =>
        guide != null &&
        typeof guide.guide_id === "number" &&
        Number.isFinite(guide.guide_id)
    )
    .sort((a, b) => a.guide_id - b.guide_id);

export const useGuides = () => {
  const [{ guides, isLoading, error }, setState] = useState<GuideListState>({
    guides: [],
    isLoading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const fetchGuides = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      ...prev,
      isLoading: true,
      error: null,
    }));

    try {
      const response = await fetch(resolveApiUrl("/api/guides"), {
        signal: controller.signal,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to load guides.");
      }
      const payload = (await response.json()) as GuideSummary[];
      setState({
        guides: normalizeGuides(payload),
        isLoading: false,
        error: null,
      });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error.";
      setState({
        guides: [],
        isLoading: false,
        error: message,
      });
    } finally {
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchGuides();
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [fetchGuides]);

  return {
    guides,
    isLoading,
    error,
    refresh: fetchGuides,
  };
};

export default useGuides;
