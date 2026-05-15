// Arabic translations for order statuses and common terms
export const STATUS_AR: Record<string, string> = {
  pending: "قيد الانتظار",
  accepted: "مقبول",
  preparing: "قيد التحضير",
  picked_up: "تم الاستلام",
  on_the_way: "في الطريق",
  delivered: "تم التوصيل",
  cancelled: "ملغي",
  returned: "مرتجع",
  on_hold: "معلّق",
};

export const STATUS_COLORS: Record<string, string> = {
  pending: "bg-warning/20 text-warning border border-warning/40",
  accepted: "bg-info/20 text-info border border-info/40",
  preparing: "bg-info/20 text-info border border-info/40",
  picked_up: "bg-accent/20 text-accent border border-accent/40",
  on_the_way: "bg-accent/20 text-accent border border-accent/40",
  delivered: "bg-success/20 text-success border border-success/40",
  cancelled: "bg-destructive/20 text-destructive border border-destructive/40",
  returned: "bg-muted text-muted-foreground border border-border",
  on_hold: "bg-warning/20 text-warning border border-warning/40",
};

export const ACTIVE_STATUSES = ["pending", "accepted", "preparing", "picked_up", "on_the_way", "on_hold"];
export const DONE_STATUSES = ["delivered"];
export const FAILED_STATUSES = ["cancelled", "returned"];

export type StatusGroup = "active" | "done" | "failed";

export function statusGroup(s: string): StatusGroup {
  if (DONE_STATUSES.includes(s)) return "done";
  if (FAILED_STATUSES.includes(s)) return "failed";
  return "active";
}
