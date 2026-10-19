"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  useExpenses,
  useDeleteExpense,
  type Expense,
} from "@/hooks/api/use-expenses";
import { useLocalization } from "@/hooks/use-localization";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { ExpenseFormDialog } from "@/components/expenses/expense-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";

export default function ExpensesPage() {
  const { t } = useLocalization();
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Expense | null>(null);
  const deleteExpense = useDeleteExpense();

  const { data, isLoading, error, refetch } = useExpenses({
    page,
    limit,
    search: debouncedSearch || undefined,
  });

  const expenses = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / (data.limit || 1)) : 1;

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "category",
      header: t("expensesPages.list.category"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">{row.original.category}</span>
          {row.original.description && (
            <span className="text-xs text-muted-foreground">{row.original.description}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "amount",
      header: t("expensesPages.list.amount"),
      cell: ({ row }) => (
        <span className="font-semibold tabular-nums">
          {formatCurrency(Number(row.original.amount || 0), row.original.currency || "USD")}
        </span>
      ),
    },
    {
      accessorKey: "paymentMethod",
      header: t("expensesPages.list.paymentMethod"),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.paymentMethod ? (
            t(`expensesPages.paymentMethods.${row.original.paymentMethod}` as never)
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      ),
    },
    {
      accessorKey: "incurredAt",
      header: t("expensesPages.list.date"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.incurredAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("expensesPages.list.title")}
        description={t("expensesPages.list.description")}
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="me-2 h-4 w-4" />
            {t("expensesPages.list.addExpense")}
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">{t("expensesPages.list.totalExpenses")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(Number(data?.totalAmount || 0))}</div>
          <p className="text-xs text-muted-foreground">{t("expensesPages.list.totalHint")}</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : expenses.length === 0 ? (
        <EmptyState
          message={debouncedSearch ? t("expensesPages.list.noSearchMatch") : t("expensesPages.list.noExpenses")}
          actionLabel={t("expensesPages.list.addExpense")}
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <DataTable
          columns={columns}
          data={expenses}
          searchPlaceholder={t("expensesPages.list.searchPlaceholder")}
          onSearch={setSearch}
          page={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
          actions={(row) => [
            {
              label: t("common.edit"),
              onClick: () => {
                setEditing(row);
                setFormOpen(true);
              },
              icon: <Pencil className="h-4 w-4" />,
            },
            {
              label: t("common.delete"),
              onClick: () => setDeleteTarget(row),
              icon: <Trash2 className="h-4 w-4" />,
              destructive: true,
            },
          ]}
        />
      )}

      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t("expensesPages.list.deleteTitle")}
        description={t("expensesPages.list.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteExpense.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
