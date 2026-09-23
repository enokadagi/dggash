"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { Plus, Eye, Trash2 } from "lucide-react";
import { useCustomers, useDeleteCustomer, type Customer } from "@/hooks/api/use-customers";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { formatDate } from "@/lib/utils";

function PaymentBadge({ paymentStatus }: { paymentStatus?: string }) {
  if (!paymentStatus) return <span className="text-muted-foreground">—</span>;
  return <StatusBadge status={paymentStatus} />;
}

function ExpiryCell({ customer }: { customer: Customer }) {
  const sub = customer.subscriptions?.[0];
  if (!sub?.expiryDate) return <span className="text-muted-foreground">—</span>;
  const expiry = new Date(sub.expiryDate);
  const now = Date.now();
  const diffMs = expiry.getTime() - now;
  const expired = diffMs < 0;
  const in5Days = diffMs >= 0 && diffMs < 5 * 24 * 60 * 60 * 1000;
  return (
    <div className="flex flex-col">
      <span>{formatDate(sub.expiryDate)}</span>
      {expired && <span className="text-xs font-medium text-destructive">Expired</span>}
      {!expired && in5Days && <span className="text-xs font-medium text-warning">Expiring soon</span>}
    </div>
  );
}

export default function CustomersPage() {
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const deleteMutation = useDeleteCustomer();

  const { data, isLoading, error, refetch } = useCustomers({
    page,
    limit,
    search: debouncedSearch || undefined,
  });

  const customers = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / (data.limit || 1)) : 1;

  const columns: ColumnDef<Customer>[] = [
    {
      accessorKey: "firstName",
      header: "Customer",
      cell: ({ row }) => (
        <Link href={`/customers/${row.original.id}`} className="flex flex-col hover:underline">
          <span className="font-medium">{row.original.firstName} {row.original.lastName}</span>
          <span className="text-xs text-muted-foreground">{row.original.phone}</span>
        </Link>
      ),
    },
    {
      accessorKey: "whatsappNumber",
      header: "WhatsApp",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.whatsappNumber || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      accessorKey: "plan",
      header: "Plan",
      cell: ({ row }) => {
        const sub = row.original.subscriptions?.[0];
        return <span>{sub?.plan?.name || "—"}</span>;
      },
    },
    {
      accessorKey: "expiryDate",
      header: "Expiry",
      cell: ({ row }) => <ExpiryCell customer={row.original} />,
    },
    {
      accessorKey: "paymentStatus",
      header: "Payment",
      cell: ({ row }) => <PaymentBadge paymentStatus={row.original.subscriptions?.[0]?.paymentStatus} />,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "city",
      header: "City",
      cell: ({ row }) => <span className="text-sm">{row.original.city || "—"}</span>,
    },
    {
      accessorKey: "createdAt",
      header: "Added",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description="Contact list, subscriptions, and payment status"
        actions={
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="me-2 h-4 w-4" />
              Add Customer
            </Link>
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : customers.length === 0 ? (
        <EmptyState
          message={debouncedSearch ? "No customers match your search" : "No customers yet"}
          actionLabel="Add Customer"
          onAction={() => (window.location.href = "/customers/new")}
        />
      ) : (
        <DataTable
          columns={columns}
          data={customers}
          searchPlaceholder="Search by name, phone, or city..."
          onSearch={setSearch}
          page={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
          actions={(row) => [
            { label: "View", onClick: () => (window.location.href = `/customers/${row.id}`), icon: <Eye className="h-4 w-4" /> },
            { label: "Delete", onClick: () => setDeleteId(row.id), icon: <Trash2 className="h-4 w-4" />, destructive: true },
          ]}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete customer"
        description="This will permanently remove the customer record. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) deleteMutation.mutate(deleteId);
          setDeleteId(null);
        }}
      />
    </div>
  );
}