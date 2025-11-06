export type Role = "system" | "user" | "assistant";

export type MessageStatus = "ready" | "pending" | "error";

export interface SourceGuide {
  guide_id: number;
  title: string;
  url: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
  status: MessageStatus;
  sources?: string[];
  sourceGuides?: SourceGuide[];
  numContexts?: number;
  error?: string;
}

export interface ChatSettings {
  topK: number;
  token?: string;
}

export interface ChatResponsePayload {
  answer: string;
  sources: string[];
  num_contexts: number;
  source_guides: SourceGuide[];
}
