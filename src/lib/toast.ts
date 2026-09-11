/** Minimaler Toast-Store (global, ohne Abhängigkeit). */

export type ToastTone = "ok" | "error";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

let items: ToastItem[] = [];
const listeners = new Set<(items: ToastItem[]) => void>();

function emit(): void {
  for (const listener of listeners) listener(items);
}

export function showToast(message: string, tone: ToastTone = "ok"): void {
  const id = Date.now() + Math.floor(Math.random() * 1000);
  items = [...items, { id, message, tone }];
  emit();
  setTimeout(() => {
    items = items.filter((item) => item.id !== id);
    emit();
  }, 2800);
}

export function subscribeToasts(listener: (items: ToastItem[]) => void): () => void {
  listeners.add(listener);
  listener(items);
  return () => {
    listeners.delete(listener);
  };
}
