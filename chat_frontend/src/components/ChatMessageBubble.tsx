import clsx from "clsx";
import SourceList from "./SourceList";
import type { ChatMessage } from "../types";

interface ChatMessageBubbleProps {
  message: ChatMessage;
}

const MessageContent = ({ content }: { content: string }) => {
  const segments = content.split("\n");
  return (
    <>
      {segments.map((segment, index) => (
        <p key={index} className="message__text">
          {segment}
        </p>
      ))}
    </>
  );
};

const ChatMessageBubble = ({ message }: ChatMessageBubbleProps) => {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="message message--system">
        <div className="message__system-bubble">
          <MessageContent content={message.content} />
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
            <MessageContent content={message.content} />
          )}
          {message.status === "error" && message.error ? (
            <span className="message__error">{message.error}</span>
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
