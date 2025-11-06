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
  images?: string[];
}

export type ChatScope = "site" | "guide";

export interface ChatSettings {
  topK: number;
  token?: string;
  scope: ChatScope;
  guideId?: number;
}

export interface ChatResponsePayload {
  answer: string;
  sources: string[];
  num_contexts: number;
  source_guides: SourceGuide[];
  images?: string[];
}

export interface GuideSummary {
  guide_id: number;
  source?: string | null;
}

export interface ServerHealth {
  status: "ok";
  vector_points: number;
  timestamp: string;
}
