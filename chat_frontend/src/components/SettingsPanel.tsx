import { FormEvent, useState } from "react";
import type { ChatSettings } from "../types";

interface SettingsPanelProps {
  settings: ChatSettings;
  onClose: () => void;
  onSubmit: (settings: Partial<ChatSettings>) => void;
}

const clampTopK = (value: number) => {
  if (Number.isNaN(value)) {
    return 1;
  }
  return Math.min(Math.max(1, value), 20);
};

const SettingsPanel = ({ settings, onClose, onSubmit }: SettingsPanelProps) => {
  const [topK, setTopK] = useState(settings.topK);
  const [token, setToken] = useState(settings.token ?? "");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      topK: clampTopK(topK),
      token: token.trim() || undefined,
    });
    onClose();
  };

  return (
    <div className="settings">
      <div className="settings__backdrop" onClick={onClose} />
      <form className="settings__panel" onSubmit={handleSubmit}>
        <header className="settings__header">
          <h2>Chat Settings</h2>
          <button type="button" className="settings__close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="settings__body">
          <label className="settings__field">
            <span className="settings__label">
              Context results (top-k)
              <span className="settings__hint">
                How many vector matches to retrieve per question (1 - 20).
              </span>
            </span>
            <input
              type="number"
              min={1}
              max={20}
              value={topK}
              onChange={(event) => setTopK(Number(event.target.value))}
            />
          </label>
          <label className="settings__field">
            <span className="settings__label">
              Dozuki API token (optional)
              <span className="settings__hint">
                Used to fetch guide titles/URLs for richer citations.
              </span>
            </span>
            <input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="api 12345..."
            />
          </label>
        </div>
        <footer className="settings__footer">
          <button
            type="button"
            className="settings__button settings__button--ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="settings__button settings__button--primary"
          >
            Save
          </button>
        </footer>
      </form>
    </div>
  );
};

export default SettingsPanel;
