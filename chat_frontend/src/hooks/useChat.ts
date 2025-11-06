import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveApiUrl, SETTINGS_STORAGE_KEY, DEFAULT_TOP_K, DEFAULT_TOKEN } from "../config";
import type { ChatMessage, ChatResponsePayload, ChatSettings } from "../types";

const createMessageId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const createSystemMessage = (): ChatMessage => ({
  id: createMessageId(),
  role: "system",
  content:
    "You are connected to the knowledge base ingested from Dozuki. Ask clear, specific questions to get grounded answers backed by references.",
  createdAt: new Date().toISOString(),
  status: "ready",
});

const SETTINGS_DEFAULT: ChatSettings = {
  topK: DEFAULT_TOP_K,
  token: DEFAULT_TOKEN,
  scope: "site",
  guideId: undefined,
};

const GUIDE_REQUIRED_MESSAGE =
  "Select a guide before starting a guide-specific chat.";

const loadStoredSettings = (): ChatSettings => {
  if (typeof window === "undefined") {
    return SETTINGS_DEFAULT;
  }

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return SETTINGS_DEFAULT;
    }
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    const rawGuideId = parsed?.guideId;
    return {
      topK: parsed.topK ?? SETTINGS_DEFAULT.topK,
      token: parsed.token ?? SETTINGS_DEFAULT.token,
      scope: parsed.scope === "guide" ? "guide" : SETTINGS_DEFAULT.scope,
      guideId:
        typeof rawGuideId === "number" && Number.isFinite(rawGuideId)
          ? rawGuideId
          : undefined,
    };
  } catch {
    return SETTINGS_DEFAULT;
  }
};

export const useChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([createSystemMessage()]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ChatSettings>(loadStoredSettings);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (error !== GUIDE_REQUIRED_MESSAGE) {
      return;
    }
    if (settings.scope === "guide" && settings.guideId == null) {
      return;
    }
    setError(null);
  }, [error, settings.guideId, settings.scope]);

  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([createSystemMessage()]);
    setError(null);
    setIsSending(false);
  }, []);

  const cancelRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setIsSending(false);
    }
  }, []);

  const updateSettings = useCallback((next: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const merged = {
        ...prev,
        ...next,
      };
      if (merged.scope === "site") {
        merged.guideId = undefined;
      }
      return merged;
    });
  }, []);

  const sendMessage = useCallback(
    async (rawContent: string) => {
      const content = rawContent.trim();
      if (!content || isSending) {
        return;
      }
      if (settings.scope === "guide" && settings.guideId == null) {
        setError(GUIDE_REQUIRED_MESSAGE);
        return;
      }

      const userMessage: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content,
        createdAt: new Date().toISOString(),
        status: "ready",
      };

      const pendingAssistant: ChatMessage = {
        id: createMessageId(),
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        status: "pending",
      };

      const payloadMessages = [...messagesRef.current, userMessage]
        .filter((msg) => msg.role !== "system")
        .map((msg) => ({
          role: msg.role,
          content: msg.content,
        }));

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setMessages((prev) => [...prev, userMessage, pendingAssistant]);
      setIsSending(true);
      setError(null);

      try {
        const response = await fetch(resolveApiUrl("/api/chat"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: payloadMessages,
            top_k: settings.topK,
            scope: settings.scope,
            ...(settings.scope === "guide" && settings.guideId != null
              ? { guide_id: settings.guideId }
              : {}),
            ...(settings.token ? { token: settings.token } : {}),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Failed to generate answer.");
        }

        const data = (await response.json()) as ChatResponsePayload;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === pendingAssistant.id
              ? {
                  ...msg,
                  content: data.answer,
                  status: "ready",
                  sources: data.sources ?? [],
                  sourceGuides: data.source_guides ?? [],
                  numContexts: data.num_contexts ?? 0,
                }
              : msg
          )
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error occurred.";

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === pendingAssistant.id
              ? {
                  ...msg,
                  content: "I ran into an issue generating a response.",
                  status: "error",
                  error: message,
                }
              : msg
          )
        );
        setError(message);
      } finally {
        setIsSending(false);
        abortRef.current = null;
      }
    },
    [isSending, settings.guideId, settings.scope, settings.topK, settings.token]
  );

  const messagesWithoutSystem = useMemo(
    () => messages.filter((msg) => msg.role !== "system"),
    [messages]
  );

  return {
    messages,
    displayMessages: messagesWithoutSystem,
    isSending,
    error,
    settings,
    sendMessage,
    resetConversation,
    cancelRequest,
    updateSettings,
  };
};
