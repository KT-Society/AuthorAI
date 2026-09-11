import { createContext, useContext } from "react";
import {
  BookOpen,
  FileText,
  GitBranch,
  Globe2,
  Image,
  Info,
  Search,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NotificationKind =
  | "book"
  | "chapter"
  | "character"
  | "cover"
  | "world"
  | "plot"
  | "research"
  | "info";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
  /** Navigation target (nav id) when the notification is opened. */
  view?: string;
  /** Optional book to open when the notification is clicked. */
  bookId?: string;
}

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  message: string;
  view?: string;
  bookId?: string;
}

export interface NotificationsValue {
  notifications: AppNotification[];
  unread: number;
  push: (input: NotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clear: () => void;
  /** Opens the notification (navigates + marks it read). */
  activate: (notification: AppNotification) => void;
}

const NOOP: NotificationsValue = {
  notifications: [],
  unread: 0,
  push: () => {},
  markRead: () => {},
  markAllRead: () => {},
  clear: () => {},
  activate: () => {},
};

export const NotificationsContext = createContext<NotificationsValue>(NOOP);

export function useNotifications(): NotificationsValue {
  return useContext(NotificationsContext);
}

export const NOTIFICATION_META: Record<NotificationKind, { icon: LucideIcon; className: string }> = {
  book: { icon: BookOpen, className: "bg-brand-violet/10 text-brand-violet" },
  chapter: { icon: FileText, className: "bg-brand-cyan/10 text-brand-cyan" },
  character: { icon: Users, className: "bg-brand-indigo/10 text-brand-indigo" },
  cover: { icon: Image, className: "bg-brand-amber/10 text-brand-amber" },
  world: { icon: Globe2, className: "bg-brand-emerald/10 text-brand-emerald" },
  plot: { icon: GitBranch, className: "bg-brand-rose/10 text-brand-rose" },
  research: { icon: Search, className: "bg-brand-cyan/10 text-brand-cyan" },
  info: { icon: Info, className: "bg-white/10 text-foreground/80" },
};

export function makeNotification(input: NotificationInput): AppNotification {
  return {
    id: `ntf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    kind: input.kind,
    title: input.title,
    message: input.message,
    createdAt: new Date().toISOString(),
    read: false,
    view: input.view,
    bookId: input.bookId,
  };
}

/** No example notifications: the activity feed fills from real usage only. */
export const SEED_NOTIFICATIONS: AppNotification[] = [];
