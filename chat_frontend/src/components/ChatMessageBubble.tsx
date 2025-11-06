import clsx from "clsx";
import SourceList from "./SourceList";
import ImageGallery from "./ImageGallery";
import type { ChatMessage } from "../types";
import MarkdownRenderer from "./MarkdownRenderer";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

const ChatMessageBubble = ({ message }: ChatMessageBubbleProps) => {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="message message--system">
        <div className="message__system-bubble">
          <MarkdownRenderer content={message.content} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={clsx("message", {
        "message--user": isUser,
        "message--assistant": isAssistant,
        "message--error": message.status === "error",
      })}
    >
      <div className="message__avatar" aria-hidden="true">
        {isUser ? "You" : "AI"}
      </div>
      <div className="message__body">
        <div className="message__bubble">
          {message.status === "pending" ? (
            <span className="message__loader">
              <span className="message__dot" />
              <span className="message__dot" />
              <span className="message__dot" />
            </span>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}
          {message.status === "error" && message.error ? (
            <span className="message__error">{message.error}</span>
          ) : null}
          {isAssistant && message.status === "ready" && message.images && message.images.length > 0 ? (
            <ImageGallery images={message.images} max={12} />
          ) : null}
        </div>
        {isAssistant && message.status === "ready" ? (
          <SourceList
            sources={message.sources}
            guides={message.sourceGuides}
            numContexts={message.numContexts}
          />
        ) : null}
      </div>
    </div>
  );
};

export default ChatMessageBubble;
