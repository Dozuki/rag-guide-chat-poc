import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";

interface MessageComposerProps {
  disabled?: boolean;
  isSending?: boolean;
  onSend: (value: string) => Promise<void> | void;
  onCancel: () => void;
}

const MessageComposer = ({
  disabled = false,
  isSending = false,
  onSend,
  onCancel,
}: MessageComposerProps) => {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    setValue("");
    await onSend(trimmed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      const trimmed = value.trim();
      if (trimmed && !disabled) {
        setValue("");
        void onSend(trimmed);
      }
    }
  };

  return (
    <form
      className="composer"
      onSubmit={handleSubmit}
      data-testid="message-composer"
    >
      <textarea
        ref={textareaRef}
        className="composer__input"
        placeholder="Ask a question about the Dozuki guides..."
        value={value}
        minLength={1}
        rows={1}
        maxLength={2000}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        data-testid="message-input"
      />
      <div className="composer__actions">
        {isSending ? (
          <button
            type="button"
            className="composer__button composer__button--cancel"
            onClick={onCancel}
            data-testid="cancel-button"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          className="composer__button composer__button--primary"
          disabled={disabled || !value.trim()}
          data-testid="send-button"
        >
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
};

export default MessageComposer;
