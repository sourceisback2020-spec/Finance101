import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

type Props = {
  icon?: LucideIcon;
  title?: string;
  description: string;
  action?: string;
  onAction?: () => void;
};

export function EmptyState({ icon: Icon = Inbox, title, description, action, onAction }: Props) {
  return (
    <div className="empty-state">
      <Icon size={48} className="empty-state-icon" />
      {title && <h4 className="empty-state-title">{title}</h4>}
      <p className="empty-state-desc">{description}</p>
      {action && onAction && (
        <button className="primary-btn btn-sm empty-state-action" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
