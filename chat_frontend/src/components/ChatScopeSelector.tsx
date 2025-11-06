import clsx from "clsx";
import type { ChatScope, GuideSummary } from "../types";

interface ChatScopeSelectorProps {
  scope: ChatScope;
  guideId?: number;
  guides: GuideSummary[];
  isLoading: boolean;
  error: string | null;
  onScopeChange: (scope: ChatScope) => void;
  onGuideChange: (guideId: number | undefined) => void;
  onReload: () => void;
}

const formatGuideLabel = ({ guide_id, source }: GuideSummary) => {
  if (source) {
    return `${guide_id} — ${source}`;
  }
  return `Guide ${guide_id}`;
};

const ChatScopeSelector = ({
  scope,
  guideId,
  guides,
  isLoading,
  error,
  onScopeChange,
  onGuideChange,
  onReload,
}: ChatScopeSelectorProps) => {
  const hasGuides = guides.length > 0;
  const handleGuideSelect = (value: string) => {
    if (!value) {
      onGuideChange(undefined);
      return;
    }
    const parsed = Number.parseInt(value, 10);
    onGuideChange(Number.isFinite(parsed) ? parsed : undefined);
  };

  return (
    <section className="scope-selector" aria-label="Chat scope">
      <div className="scope-selector__controls">
        <button
          type="button"
          className={clsx("scope-selector__button", {
            "scope-selector__button--active": scope === "site",
          })}
          onClick={() => onScopeChange("site")}
        >
          Entire Site
        </button>
        <button
          type="button"
          className={clsx("scope-selector__button", {
            "scope-selector__button--active": scope === "guide",
          })}
          onClick={() => onScopeChange("guide")}
        >
          Single Guide
        </button>
      </div>

      {scope === "guide" ? (
        <div className="scope-selector__details">
          {isLoading ? (
            <span className="scope-selector__status">Loading guides…</span>
          ) : null}
          {error ? (
            <div className="scope-selector__status scope-selector__status--error">
              <span>{error}</span>
              <button
                type="button"
                className="scope-selector__status-button"
                onClick={onReload}
              >
                Try again
              </button>
            </div>
          ) : null}
          {!isLoading && !error ? (
            hasGuides ? (
              <label className="scope-selector__field">
                <span className="scope-selector__label">Guide</span>
                <select
                  value={guideId ?? ""}
                  onChange={(event) => handleGuideSelect(event.target.value)}
                >
                  {guides.map((guide) => (
                    <option key={guide.guide_id} value={guide.guide_id}>
                      {formatGuideLabel(guide)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="scope-selector__status">
                <span>
                  No guides available yet. Ingest a guide, then refresh the list.
                </span>
                <button
                  type="button"
                  className="scope-selector__status-button"
                  onClick={onReload}
                >
                  Refresh list
                </button>
              </div>
            )
          ) : null}
        </div>
      ) : null}
    </section>
  );
};

export default ChatScopeSelector;
