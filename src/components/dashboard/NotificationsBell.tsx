import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { timeAgo } from "@/data/author";
import { NOTIFICATION_META, useNotifications } from "@/lib/notifications";

export function NotificationsBell() {
  const { notifications, unread, markAllRead, clear, activate } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="outline"
        size="icon-lg"
        className="glass relative rounded-xl border-white/10"
        title="Benachrichtigungen"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <>
            <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-brand-rose shadow-[0_0_10px_hsl(342_90%_62%)]" />
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-brand-rose px-1 text-[10px] font-bold text-white shadow-[0_0_10px_hsl(342_90%_62%)]">
              {unread > 9 ? "9+" : unread}
            </span>
          </>
        ) : null}
      </Button>

      {open ? (
        <div className="glass-strong float-in absolute right-0 top-14 z-50 w-80 overflow-hidden rounded-2xl sm:w-96">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm font-semibold tracking-tight">Benachrichtigungen</p>
              <p className="text-[11px] text-muted-foreground">
                {unread > 0 ? `${unread} ungelesen` : "Alles gelesen"}
              </p>
            </div>
            {notifications.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg text-[11px] text-muted-foreground hover:text-foreground"
                onClick={markAllRead}
              >
                <CheckCheck className="size-3.5" />
                Alle gelesen
              </Button>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <Bell className="size-5 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Keine Benachrichtigungen.</p>
              </div>
            ) : (
              notifications.map((notification) => {
                const meta = NOTIFICATION_META[notification.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => {
                      activate(notification);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5",
                      !notification.read && "bg-white/[0.03]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                        meta.className,
                      )}
                    >
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{notification.title}</span>
                        {!notification.read ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-brand-rose" />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                        {notification.message}
                      </span>
                      <span className="mt-1 block text-[10px] text-muted-foreground/70">
                        {timeAgo(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {notifications.length > 0 ? (
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
              <span className="text-[10px] text-muted-foreground">
                {notifications.length} gespeichert
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg text-[11px] text-muted-foreground hover:text-brand-rose"
                onClick={clear}
              >
                <Trash2 className="size-3.5" />
                Leeren
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
