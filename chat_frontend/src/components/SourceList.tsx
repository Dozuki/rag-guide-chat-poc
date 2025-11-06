import { useMemo } from "react";
import { DOZUKI_BASE_URL } from "../config";
import type { SourceGuide } from "../types";

interface SourceListProps {
  sources?: string[];
  guides?: SourceGuide[];
  numContexts?: number;
}

const GUIDE_SOURCE_REGEX = /^([a-z0-9_-]+)_guide_(\d+)$/i;

const buildGuideHref = (
  url?: string,
  siteSlug?: string,
  guideId?: number | string,
  title?: string
): string | undefined => {
  if (url && /^https?:\/\//i.test(url)) {
    return url;
  }

  const normalizedId = guideId != null ? String(guideId) : undefined;
  const normalizedPath =
    url && url.startsWith("/") ? url : url ? `/${url}` : undefined;
  const siteBase =
    DOZUKI_BASE_URL ||
    (siteSlug ? `https://${siteSlug}.dozuki.com` : undefined);

  if (normalizedPath && siteBase) {
    return `${siteBase}${normalizedPath}`;
  }

  if (normalizedPath) {
    return normalizedPath;
  }

  if (normalizedId && siteBase) {
    if (title) {
      const slug = encodeURIComponent(title).replace(/%20/g, "+");
      return `${siteBase}/Guide/${slug}/${normalizedId}`;
    }
    return `${siteBase}/Guide/${normalizedId}`;
  }

  if (normalizedId && siteSlug) {
    if (title) {
      const slug = encodeURIComponent(title).replace(/%20/g, "+");
      return `https://${siteSlug}.dozuki.com/Guide/${slug}/${normalizedId}`;
    }
    return `https://${siteSlug}.dozuki.com/Guide/${normalizedId}`;
  }

  return undefined;
};

const parseGuideSource = (value: string) => {
  const match = GUIDE_SOURCE_REGEX.exec(value.trim());
  if (!match) {
    return undefined;
  }
  return {
    siteSlug: match[1],
    guideId: Number.parseInt(match[2], 10),
  };
};

const SourceList = ({ sources = [], guides = [], numContexts }: SourceListProps) => {
  const uniqueSources = useMemo(
    () => Array.from(new Set(sources)).filter(Boolean),
    [sources]
  );

  const sourceGuideMap = useMemo(() => {
    const map = new Map<number, SourceGuide>();
    guides.forEach((guide) => {
      const guideId =
        typeof guide.guide_id === "number"
          ? guide.guide_id
          : Number.parseInt(String(guide.guide_id ?? Number.NaN), 10);
      if (!Number.isNaN(guideId)) {
        map.set(guideId, guide);
      }
    });
    return map;
  }, [guides]);

  const parsedSourceMeta = useMemo(() => {
    const meta = new Map<number, { raw: string; site: string }>();
    sources.forEach((source) => {
      const parsed = parseGuideSource(source);
      if (parsed) {
        meta.set(parsed.guideId, { raw: source, site: parsed.siteSlug });
      }
    });
    return meta;
  }, [sources]);

  const fallbackNodes = useMemo(() => {
    const nodes: JSX.Element[] = [];
    uniqueSources.forEach((source) => {
      const parsed = parseGuideSource(source);
      if (parsed && sourceGuideMap.has(parsed.guideId)) {
        return;
      }

      if (parsed) {
        const href = buildGuideHref(undefined, parsed.siteSlug, parsed.guideId);
        if (href) {
          nodes.push(
            <a
              key={source}
              className="sources__item sources__item--guide sources__item--guide-fallback"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              <span className="sources__item-title">
                Guide {parsed.guideId}
              </span>
              <span className="sources__item-subtitle">{href}</span>
            </a>
          );
          return;
        }
      }

      nodes.push(
        <span key={source} className="sources__item sources__item--tag">
          {source}
        </span>
      );
    });
    return nodes;
  }, [uniqueSources, sourceGuideMap]);

  const hasGuides = guides.length > 0;
  const hasSources = uniqueSources.length > 0;

  if (!hasGuides && !hasSources) {
    return null;
  }

  return (
    <div className="sources">
      <div className="sources__header">
        <span className="sources__title">References</span>
        {typeof numContexts === "number" && numContexts > 0 ? (
          <span className="sources__meta">
            {numContexts} context {numContexts === 1 ? "chunk" : "chunks"}
          </span>
        ) : null}
      </div>
      <div className="sources__list">
        {guides.map((guide) => (
          (() => {
            const guideId =
              typeof guide.guide_id === "number"
                ? guide.guide_id
                : Number.parseInt(String(guide.guide_id ?? Number.NaN), 10);
            const sourceMeta = Number.isNaN(guideId)
              ? undefined
              : parsedSourceMeta.get(guideId);
            const href = buildGuideHref(guide.url, sourceMeta?.site, guideId, guide.title);
            const displayUrl = guide.url || href;

            if (!href) {
              return (
                <div
                  key={guide.guide_id ?? guide.title}
                  className="sources__item sources__item--guide"
                  aria-disabled="true"
                >
                  <span className="sources__item-title">{guide.title}</span>
                  {displayUrl ? (
                    <span className="sources__item-subtitle">{displayUrl}</span>
                  ) : null}
                </div>
              );
            }

            return (
              <a
                key={guide.guide_id ?? guide.title}
                className="sources__item sources__item--guide"
                href={href}
                target="_blank"
                rel="noreferrer"
              >
                <span className="sources__item-title">{guide.title}</span>
                {displayUrl ? (
                  <span className="sources__item-subtitle">{displayUrl}</span>
                ) : null}
              </a>
            );
          })()
        ))}
        {fallbackNodes}
      </div>
    </div>
  );
};

export default SourceList;
