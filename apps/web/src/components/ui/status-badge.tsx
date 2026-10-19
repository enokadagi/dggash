import { cva, type VariantProps } from "class-variance-authority";
import { useLocalization } from "@/hooks/use-localization";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      status: {
        active: "border-transparent bg-success/10 text-success",
        inactive: "border-transparent bg-muted text-muted-foreground",
        suspended: "border-transparent bg-warning/10 text-warning",
        expired: "border-transparent bg-destructive/10 text-destructive",
        cancelled: "border-transparent bg-destructive/10 text-destructive",
        canceled: "border-transparent bg-destructive/10 text-destructive",
        pending: "border-transparent bg-primary/10 text-primary",
        draft: "border-transparent bg-muted text-muted-foreground",
        sent: "border-transparent bg-primary/10 text-primary",
        paid: "border-transparent bg-success/10 text-success",
        partial: "border-transparent bg-warning/10 text-warning",
        partially_paid: "border-transparent bg-warning/10 text-warning",
        overdue: "border-transparent bg-destructive/10 text-destructive",
        completed: "border-transparent bg-success/10 text-success",
        failed: "border-transparent bg-destructive/10 text-destructive",
        refunded: "border-transparent bg-warning/10 text-warning",
        online: "border-transparent bg-success/10 text-success",
        offline: "border-transparent bg-muted text-muted-foreground",
        maintenance: "border-transparent bg-warning/10 text-warning",
        open: "border-transparent bg-primary/10 text-primary",
        in_progress: "border-transparent bg-primary/10 text-primary",
        waiting: "border-transparent bg-warning/10 text-warning",
        resolved: "border-transparent bg-success/10 text-success",
        closed: "border-transparent bg-muted text-muted-foreground",
        scheduled: "border-transparent bg-primary/10 text-primary",
        low: "border-transparent bg-muted text-muted-foreground",
        medium: "border-transparent bg-primary/10 text-primary",
        high: "border-transparent bg-warning/10 text-warning",
        urgent: "border-transparent bg-destructive/10 text-destructive",
        info: "border-transparent bg-primary/10 text-primary",
        error: "border-transparent bg-destructive/10 text-destructive",
        success: "border-transparent bg-success/10 text-success",
        warning: "border-transparent bg-warning/10 text-warning",
        low_stock: "border-transparent bg-warning/10 text-warning",
        out_of_stock: "border-transparent bg-destructive/10 text-destructive",
        in_stock: "border-transparent bg-success/10 text-success",
        unpaid: "border-transparent bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      status: "active",
    },
  }
);

interface StatusBadgeProps {
  status?: string | null;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useLocalization();
  const safeStatus = typeof status === "string" && status.trim() ? status.trim() : "unknown";
  const normalized = safeStatus.toUpperCase();
  const key = normalized.toLowerCase().replace(/ /g, "_");
  const normalizedStatus = key as VariantProps<typeof statusBadgeVariants>["status"];
  
  const statusMap: Record<string, string> = {
    COMPLETED: t("sharedComponents.statuses.completed"),
    PENDING: t("sharedComponents.statuses.pending"),
    CANCELLED: t("sharedComponents.statuses.cancelled"),
    CANCELED: t("sharedComponents.statuses.cancelled"),
    REFUNDED: t("sharedComponents.statuses.refunded"),
    ACTIVE: t("sharedComponents.statuses.active"),
    INACTIVE: t("sharedComponents.statuses.inactive"),
    SUSPENDED: t("sharedComponents.statuses.suspended"),
    EXPIRED: t("sharedComponents.statuses.expired"),
    PAID: t("sharedComponents.statuses.paid"),
    UNPAID: t("sharedComponents.statuses.unpaid"),
    PARTIALLY_PAID: t("sharedComponents.statuses.partiallyPaid"),
    LOW_STOCK: t("sharedComponents.statuses.lowStock"),
    OUT_OF_STOCK: t("sharedComponents.statuses.outOfStock"),
    IN_STOCK: t("sharedComponents.statuses.inStock"),
    OPEN: t("sharedComponents.statuses.open"),
    IN_PROGRESS: t("sharedComponents.statuses.inProgress"),
    WAITING: t("sharedComponents.statuses.waiting"),
    RESOLVED: t("sharedComponents.statuses.resolved"),
    CLOSED: t("sharedComponents.statuses.closed"),
  };
  
  const label = statusMap[normalized] || safeStatus.replace(/_/g, " ");
  return (
    <span className={cn(statusBadgeVariants({ status: normalizedStatus }), className)}>
      {label}
    </span>
  );
}
