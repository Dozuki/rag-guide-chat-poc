import { useEffect, useRef, useState } from "react";
import ChatMessageBubble from "./components/ChatMessageBubble";
import MessageComposer from "./components/MessageComposer";
import SettingsPanel from "./components/SettingsPanel";
import ChatScopeSelector from "./components/ChatScopeSelector";
import ServerStatusBadge from "./components/ServerStatusBadge";
import { useChat } from "./hooks/useChat";
import { useGuides } from "./hooks/useGuides";
import { useServerStatus } from "./hooks/useServerStatus";

const App = () => {
  const {
    messages,
    isSending,
    error,
    sendMessage,
    resetConversation,
    cancelRequest,
    settings,
    updateSettings,
  } = useChat();
  const {
    guides,
    isLoading: isLoadingGuides,
    error: guidesError,
    refresh,
  } = useGuides();
  const {
    status: serverStatus,
    health: serverHealth,
    isChecking: isCheckingServer,
    error: serverError,
    lastChecked,
    checkStatus,
  } = useServerStatus();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const isGuideSelectionRequired =
    settings.scope === "guide" && settings.guideId == null;
  const isServerOffline = serverStatus === "offline";

  useEffect(() => {
    if (settings.scope !== "guide") {
      return;
    }
    if (!guides.length) {
      if (settings.guideId != null) {
        updateSettings({ guideId: undefined });
      }
      return;
    }

    const currentExists = guides.some(
      (guide) => guide.guide_id === settings.guideId
    );

    if (!currentExists) {
      updateSettings({ guideId: guides[0].guide_id });
    }
  }, [guides, settings.guideId, settings.scope, updateSettings]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div className="app-shell">
      <div className="app">
        <header className="app__header">
          <div className="app__title">
            <h1>RAG Knowledge Chat</h1>
            <p>
              Converse with the ingested Dozuki documentation. Responses include
              grounded references so you can verify every answer.
            </p>
          </div>
          <div className="app__meta">
            <ChatScopeSelector
              scope={settings.scope}
              guideId={settings.guideId}
              guides={guides}
              isLoading={isLoadingGuides}
              error={guidesError}
              onScopeChange={(scope) => updateSettings({ scope })}
              onGuideChange={(guideId) => updateSettings({ guideId })}
              onReload={refresh}
            />
            <ServerStatusBadge
              status={serverStatus}
              health={serverHealth}
              isChecking={isCheckingServer}
              error={serverError}
              lastChecked={lastChecked}
              onRetry={checkStatus}
            />
          </div>
          <div className="app__actions">
            <button
              type="button"
              className="app__button"
              onClick={resetConversation}
              disabled={isSending}
            >
              New Conversation
            </button>
            <button
              type="button"
              className="app__button app__button--secondary"
              onClick={() => setIsSettingsOpen(true)}
              disabled={isSettingsOpen}
            >
              Settings
            </button>
          </div>
        </header>
        {error ? (
          <div className="app__alert" role="status">
            <strong>Heads up:</strong> {error}
          </div>
        ) : null}
        {isServerOffline ? (
          <div
            className="app__alert app__alert--error"
            role="status"
            data-testid="server-offline-alert"
          >
            <strong>Server offline:</strong> Check connectivity or restart the
            API, then refresh the status badge.
          </div>
        ) : null}
        {isGuideSelectionRequired ? (
          <div className="app__alert app__alert--info" role="status">
            <strong>Pick a guide:</strong> Select an ingested guide from the
            scope switcher to start chatting.
          </div>
        ) : null}
        <main className="app__main" ref={scrollRef}>
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </main>
        <footer className="app__footer">
          <MessageComposer
            onSend={sendMessage}
            onCancel={cancelRequest}
            disabled={isSending || isGuideSelectionRequired || isServerOffline}
            isSending={isSending}
          />
          <span className="app__footnote">
            Built for Dozuki + Qdrant RAG workflows. Data stays within your
            environment; only the text you type is sent to the RAG API.
          </span>
        </footer>
      </div>
      {isSettingsOpen ? (
        <SettingsPanel
          onClose={() => setIsSettingsOpen(false)}
          settings={settings}
          onSubmit={updateSettings}
        />
      ) : null}
    </div>
  );
};

export default App;
