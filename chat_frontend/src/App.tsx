import { useEffect, useRef, useState } from "react";
import ChatMessageBubble from "./components/ChatMessageBubble";
import MessageComposer from "./components/MessageComposer";
import SettingsPanel from "./components/SettingsPanel";
import { useChat } from "./hooks/useChat";

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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
        <main className="app__main" ref={scrollRef}>
          {messages.map((message) => (
            <ChatMessageBubble key={message.id} message={message} />
          ))}
        </main>
        <footer className="app__footer">
          <MessageComposer
            onSend={sendMessage}
            onCancel={cancelRequest}
            disabled={isSending}
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
