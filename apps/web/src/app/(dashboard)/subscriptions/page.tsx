"use client";

import * as React from "react";
import { Suspense } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { useSubscriptions, useSuspendSubscription, useReactivateSubscription, useUpdateSubscription, useRenewSubscription, useCancelSubscription, type Subscription } from "@/hooks/api/use-subscriptions";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Pencil, RefreshCw, Ban, PauseCircle, PlayCircle } from "lucide-react";

type RowAction = { label: string; onClick: () => void; icon?: React.ReactNode; destructive?: boolean };

const PAYMENT_OPTIONS = ["paid", "pending", "partially_paid"] as const;

function toDateInputValue(iso?: string) {
  return iso ? iso.slice(0, 10) : "";
}

function SubscriptionsContent() {
  const { t } = useLocalization();
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get("status") || undefined;
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const [editing, setEditing] = React.useState<Subscription | null>(null);
  const [cancelling, setCancelling] = React.useState<Subscription | null>(null);
  const suspendMutation = useSuspendSubscription();
  const reactivateMutation = useReactivateSubscription();
  const updateMutation = useUpdateSubscription();
  const renewMutation = useRenewSubscription();
  const cancelMutation = useCancelSubscription();

  const { data: planData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<{ data: { id: string; name: string }[] }>("/plans", { page: 1, limit: 100 }),
  });
  const plans = planData?.data || [];

  const [editForm, setEditForm] = React.useState({
    planId: "",
    startDate: "",
    expiryDate: "",
    paymentStatus: "",
    notes: "",
  });

  const openEdit = (sub: Subscription) => {
    setEditing(sub);
    setEditForm({
      planId: sub.planId,
      startDate: toDateInputValue(sub.startDate),
      expiryDate: toDateInputValue(sub.expiryDate),
      paymentStatus: sub.paymentStatus || "",
      notes: sub.notes || "",
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    updateMutation.mutate({
      id: editing.id,
      data: {
        ...(editForm.planId && editForm.planId !== editing.planId ? { planId: editForm.planId } : {}),
        ...(editForm.startDate ? { startDate: new Date(`${editForm.startDate}T00:00:00`).toISOString() } : {}),
        ...(editForm.expiryDate ? { expiryDate: new Date(`${editForm.expiryDate}T00:00:00`).toISOString() } : {}),
        ...(editForm.paymentStatus ? { paymentStatus: editForm.paymentStatus } : {}),
        ...(editForm.notes !== undefined ? { notes: editForm.notes } : {}),
      },
    });
    setEditing(null);
  };

  const { data, isLoading, error, refetch } = useSubscriptions({
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter as "ACTIVE" | "SUSPENDED" | "EXPIRED" | "CANCELLED" | "PENDING" | undefined,
  });

  const subscriptions = data?.data || [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.limit || limit))) : 1;

  const columns: ColumnDef<typeof subscriptions[number]>[] = [
    {
      accessorKey: "customer",
      header: t("common.name"),
      cell: ({ row }) => {
        const c = row.original.customer;
        return c ? `${c.firstName} ${c.lastName}` : "—";
      },
    },
    {
      accessorKey: "plan",
      header: t("subscriptions.plan"),
      cell: ({ row }) => row.original.plan?.name || "—",
    },
    {
      accessorKey: "plan.price",
      header: t("plans.price"),
      cell: ({ row }) => row.original.plan ? formatCurrency(row.original.plan.price) : "—",
    },
    {
      accessorKey: "startDate",
      header: t("subscriptions.startDate"),
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: "expiryDate",
      header: t("subscriptions.nextBilling"),
      cell: ({ row }) => formatDate(row.original.expiryDate),
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ];

  const rowActions = (row: typeof subscriptions[number]): RowAction[] => {
    const actions: RowAction[] = [
      { label: "Edit", onClick: () => openEdit(row), icon: <Pencil className="h-4 w-4" /> },
    ];
    if (row.status === "ACTIVE") {
      actions.push({ label: "Renew", onClick: () => renewMutation.mutate(row.id), icon: <RefreshCw className="h-4 w-4" /> });
      actions.push({ label: "Suspend", onClick: () => suspendMutation.mutate(row.id), icon: <PauseCircle className="h-4 w-4" /> });
    }
    if (row.status === "SUSPENDED") {
      actions.push({ label: "Reactivate", onClick: () => reactivateMutation.mutate(row.id), icon: <PlayCircle className="h-4 w-4" /> });
    }
    actions.push({ label: "Cancel", onClick: () => setCancelling(row), icon: <Ban className="h-4 w-4" />, destructive: true });
    return actions;
  };

  return (
    <div className="space-y-6">
      <PageHeader title={t("subscriptions.title")} />
      {isLoading ? (
        <LoadingState message={t("common.loading") || "Loading subscriptions..."} />
      ) : error ? (
        <ErrorState message={t("common.error") || "Failed to load subscriptions"} onRetry={() => refetch()} />
      ) : subscriptions.length === 0 ? (
        <EmptyState message={t("subscriptions.noSubscriptions") || "No subscriptions found"} />
      ) : (
      <DataTable
        columns={columns}
        data={subscriptions}
        searchPlaceholder={`${t("common.search")}...`}
        onSearch={setSearch}
        page={page}
        totalPages={totalPages}
        totalItems={data?.total}
        onPageChange={setPage}
        actions={rowActions}
      />
      )}

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>
              Update the plan, dates, payment status, or notes for this subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sub-plan">Plan</Label>
              <Select value={editForm.planId} onValueChange={(v) => setEditForm({ ...editForm, planId: v })}>
                <SelectTrigger id="sub-plan"><SelectValue placeholder="Select a plan" /></SelectTrigger>
                <SelectContent>
                  {plans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sub-start">Start date</Label>
                <Input id="sub-start" type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sub-expiry">Expiry date</Label>
                <Input id="sub-expiry" type="date" value={editForm.expiryDate} onChange={(e) => setEditForm({ ...editForm, expiryDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-payment">Payment status</Label>
              <Select value={editForm.paymentStatus} onValueChange={(v) => setEditForm({ ...editForm, paymentStatus: v })}>
                <SelectTrigger id="sub-payment"><SelectValue placeholder="Select payment status" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-notes">Notes</Label>
              <Textarea id="sub-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelling}
        onOpenChange={() => setCancelling(null)}
        title="Cancel subscription"
        description={`This will cancel the subscription for ${cancelling?.customer ? `${cancelling.customer.firstName} ${cancelling.customer.lastName}` : "this customer"}. You can create a new subscription later if needed.`}
        confirmLabel="Cancel subscription"
        destructive
        onConfirm={() => {
          if (cancelling) {
            cancelMutation.mutate(cancelling.id);
            setCancelling(null);
          }
        }}
      />
    </div>
  );
}

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading subscriptions..." />}>
      <SubscriptionsContent />
    </Suspense>
  );
}