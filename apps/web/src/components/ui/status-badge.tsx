import { cva, type VariantProps } from "class-variance-authority";
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
        pending: "border-transparent bg-primary/10 text-primary",
        draft: "border-transparent bg-muted text-muted-foreground",
        sent: "border-transparent bg-primary/10 text-primary",
        paid: "border-transparent bg-success/10 text-success",
        partial: "border-transparent bg-warning/10 text-warning",
        overdue: "border-transparent bg-destructive/10 text-destructive",
        completed: "border-transparent bg-success/10 text-success",
        failed: "border-transparent bg-destructive/10 text-destructive",
        refunded: "border-transparent bg-warning/10 text-warning",
        online: "border-transparent bg-success/10 text-success",
        offline: "border-transparent bg-muted text-muted-foreground",
        maintenance: "border-transparent bg-warning/10 text-warning",
        open: "border-transparent bg-primary/10 text-primary",
        "in_progress": "border-transparent bg-primary/10 text-primary",
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
      },
    },
    defaultVariants: {
      status: "active",
    },
  }
);

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase().replace(/ /g, "_") as VariantProps<typeof statusBadgeVariants>["status"];
  return (
    <span className={cn(statusBadgeVariants({ status: normalizedStatus }), className)}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
