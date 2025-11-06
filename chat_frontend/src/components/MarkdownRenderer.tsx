import { useMemo } from "react";
import clsx from "clsx";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const renderInline = (value: string) => {
  const parts: string[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\*(?!\s)[^*]+(?<!\s)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // biome-ignore lint/suspicious/noAssignInExpressions: deliberate regex iteration
  while ((match = tokenRegex.exec(value)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(value.slice(lastIndex, match.index)));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      parts.push(`<strong>${escapeHtml(token.slice(2, -2).trim())}</strong>`);
    } else if (token.startsWith("`")) {
      parts.push(`<code>${escapeHtml(token.slice(1, -1))}</code>`);
    } else if (token.startsWith("*")) {
      parts.push(`<em>${escapeHtml(token.slice(1, -1).trim())}</em>`);
    } else {
      parts.push(escapeHtml(token));
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < value.length) {
    parts.push(escapeHtml(value.slice(lastIndex)));
  }

  return parts.join("");
};

const toHtml = (markdown: string) => {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const listStack: Array<{ type: "ul" | "ol"; level: number }> = [];
  const html: string[] = [];
  let paragraphBuffer: string[] = [];

  const closeParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const text = paragraphBuffer.join(" ").trim();
    if (text) {
      html.push(`<p>${renderInline(text)}</p>`);
    }
    paragraphBuffer = [];
  };

  const closeListsAbove = (level: number) => {
    while (listStack.length && listStack[listStack.length - 1].level > level) {
      const closing = listStack.pop();
      if (closing) {
        html.push(`</${closing.type}>`);
      }
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine.replace(/\s+$/g, "");
    const trimmed = line.trim();
    const leadingSpaces = line.length - line.trimStart().length;
    const level = Math.max(0, Math.floor(leadingSpaces / 2));

    if (!trimmed) {
      closeParagraph();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeParagraph();
      closeListsAbove(-1);

      const [, hashes, text] = headingMatch;
      const headingLevel = Math.min(hashes.length, 6);
      html.push(`<h${headingLevel}>${renderInline(text)}</h${headingLevel}>`);
      return;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);

    if (orderedMatch || unorderedMatch) {
      closeParagraph();
      const type: "ul" | "ol" = orderedMatch ? "ol" : "ul";
      const text = orderedMatch ? orderedMatch[2] : unorderedMatch![1];

      if (!listStack.length || listStack[listStack.length - 1].level < level) {
        listStack.push({ type, level });
        html.push(`<${type}>`);
      } else {
        if (listStack[listStack.length - 1].level > level) {
          closeListsAbove(level);
        }

        const current = listStack[listStack.length - 1];
        if (!current || current.type !== type || current.level !== level) {
          closeListsAbove(level - 1);
          listStack.push({ type, level });
          html.push(`<${type}>`);
        }
      }

      html.push(`<li>${renderInline(text)}</li>`);
      return;
    }

    closeListsAbove(-1);
    paragraphBuffer.push(trimmed);
  });

  closeParagraph();
  closeListsAbove(-1);

  return html.join("");
};

const MarkdownRenderer = ({ content, className }: MarkdownRendererProps) => {
  const rendered = useMemo(() => toHtml(content), [content]);

  return (
    <div
      className={clsx("markdown-body", className)}
      dangerouslySetInnerHTML={{ __html: rendered }}
    />
  );
};

export default MarkdownRenderer;
