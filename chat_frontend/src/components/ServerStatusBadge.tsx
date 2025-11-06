import clsx from "clsx";
import type { ServerHealth } from "../types";
import type { ServerStatus } from "../hooks/useServerStatus";

interface ServerStatusBadgeProps {
  status: ServerStatus;
  health: ServerHealth | null;
  isChecking: boolean;
  error: string | null;
  lastChecked: string | null;
  onRetry: () => void;
}

const formatTimestamp = (iso: string | null) => {
  if (!iso) {
    return "";
  }
  const timestamp = new Date(iso);
  if (Number.isNaN(timestamp.getTime())) {
    return "";
  }
  return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const ServerStatusBadge = ({
  status,
  health,
  isChecking,
  error,
  lastChecked,
  onRetry,
}: ServerStatusBadgeProps) => {
  const labelMap: Record<ServerStatus, string> = {
    checking: "Checking…",
    online: "Online",
    offline: "Offline",
  };

  const subLabel =
    status === "online" && health
      ? `${health.vector_points.toLocaleString()} vectors`
      : status === "offline" && error
      ? error
      : lastChecked
      ? `Checked at ${formatTimestamp(lastChecked)}`
      : "";

  return (
    <div
      className={clsx("status-badge", `status-badge--${status}`)}
      data-testid="server-status"
      title={subLabel || labelMap[status]}
    >
      <span className="status-badge__dot" aria-hidden />
      <div className="status-badge__content">
        <span className="status-badge__label">{labelMap[status]}</span>
        {subLabel ? (
          <span className="status-badge__sublabel" data-testid="server-status-detail">
            {subLabel}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        className="status-badge__retry"
        onClick={onRetry}
        disabled={isChecking}
        data-testid="server-status-retry"
      >
        {isChecking ? "…" : "Refresh"}
      </button>
    </div>
  );
};

export default ServerStatusBadge;
