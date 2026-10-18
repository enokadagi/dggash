"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ShieldCheck, ShieldAlert, KeyRound } from "lucide-react";
import {
  useManagedUsers,
  useCreateManagedUser,
  useUpdateManagedUser,
  useDeleteManagedUser,
  useResetManagedUserPassword,
  type ManagedUser,
  type ManagedRole,
  type ManagedStatus,
} from "@/hooks/api/use-employees";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { useAuthStore } from "@/stores/auth-store";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { formatDate } from "@/lib/utils";

const ALL = "all";

function RoleBadge({ role }: { role: ManagedRole }) {
  const { t } = useLocalization();
  if (role === "ADMIN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        <ShieldCheck className="h-3 w-3" />
        {t("employees.fullAccess")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
      <ShieldAlert className="h-3 w-3" />
      {t("employees.limitedAccess")}
    </span>
  );
}

interface EmployeeFormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  password: string;
  role: ManagedRole;
  status: ManagedStatus;
}

const EMPTY_FORM: EmployeeFormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  password: "",
  role: "STAFF",
  status: "ACTIVE",
};

const PHONE_PATTERN = /^\+[1-9]\d{1,14}$/;

export default function EmployeesPage() {
  const { t } = useLocalization();
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "ADMIN";

  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const debouncedSearch = useDebounce(search);
  const [roleFilter, setRoleFilter] = React.useState<ManagedRole | "">("");
  const [statusFilter, setStatusFilter] = React.useState<ManagedStatus | "">("");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ManagedUser | null>(null);
  const [form, setForm] = React.useState<EmployeeFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [resetPassword, setResetPassword] = React.useState("");

  const [deleteTarget, setDeleteTarget] = React.useState<ManagedUser | null>(null);

  const { data, isLoading, error, refetch } = useManagedUsers({
    page,
    limit,
    search: debouncedSearch || undefined,
    role: roleFilter || undefined,
    status: statusFilter || undefined,
  });
  const createMutation = useCreateManagedUser();
  const updateMutation = useUpdateManagedUser();
  const deleteMutation = useDeleteManagedUser();
  const resetPasswordMutation = useResetManagedUserPassword();

  const employees = data?.data || [];
  const totalPages = data ? Math.ceil(data.total / (data.limit || 1)) : 1;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setResetPassword("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (user: ManagedUser) => {
    setEditing(user);
    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      email: user.email || "",
      password: "",
      role: user.role,
      status: user.status,
    });
    setResetPassword("");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      setFormError(t("pos.customerNameRequired"));
      return;
    }

    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            email: form.email.trim() || undefined,
            role: form.role,
            status: form.status,
          },
        });
        if (resetPassword && resetPassword.length >= 8) {
          await resetPasswordMutation.mutateAsync({ id: editing.id, password: resetPassword });
        }
      } else {
        if (!PHONE_PATTERN.test(form.phone.trim())) {
          setFormError(t("pos.phoneRequired"));
          return;
        }
        if (form.password.length < 8) {
          setFormError(t("employees.passwordHint"));
          return;
        }
        await createMutation.mutateAsync({
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          password: form.password,
          role: form.role,
          status: form.status,
        });
      }
      setDialogOpen(false);
    } catch {
      // toast handled by the mutation
    }
  };

  const columns: ColumnDef<ManagedUser>[] = [
    {
      accessorKey: "firstName",
      header: t("common.name"),
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {row.original.firstName} {row.original.lastName}
          </span>
          <span className="text-xs text-muted-foreground">{row.original.phone}</span>
        </div>
      ),
    },
    {
      accessorKey: "email",
      header: t("auth.email"),
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.email || <span className="text-muted-foreground">—</span>}
        </span>
      ),
    },
    {
      accessorKey: "role",
      header: t("employees.role"),
      cell: ({ row }) => <RoleBadge role={row.original.role} />,
    },
    {
      accessorKey: "status",
      header: t("common.status"),
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "lastLoginAt",
      header: t("employees.lastLogin"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "createdAt",
      header: t("common.date"),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.createdAt ? formatDate(row.original.createdAt) : "—"}
        </span>
      ),
    },
  ];

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title={t("employees.title")} description={t("employees.staffHint")} />
        <EmptyState message={t("employees.staffHint")} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("employees.title")}
        description={t("employees.description")}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t("employees.addEmployee")}
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      ) : employees.length === 0 ? (
        <EmptyState
          message={debouncedSearch ? t("employees.emptySearch") : t("employees.empty")}
          actionLabel={t("employees.addEmployee")}
          onAction={openCreate}
        />
      ) : (
        <DataTable
          columns={columns}
          data={employees}
          searchPlaceholder={t("employees.searchPlaceholder")}
          onSearch={setSearch}
          page={page}
          totalPages={totalPages}
          totalItems={data?.total}
          onPageChange={setPage}
          actions={(row) => [
            {
              label: t("common.edit"),
              onClick: () => openEdit(row),
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("employees.fullAccess")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("employees.adminHint")}</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4 text-warning" />
            {t("employees.limitedAccess")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("employees.staffHint")}</p>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("employees.editEmployee") : t("employees.addEmployee")}
            </DialogTitle>
            <DialogDescription>
              {editing ? t("common.edit") : t("employees.description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emp-first">{t("auth.firstName")}</Label>
                <Input
                  id="emp-first"
                  value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emp-last">{t("auth.lastName")}</Label>
                <Input
                  id="emp-last"
                  value={form.lastName}
                  onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-phone">{t("auth.phone")}</Label>
              <Input
                id="emp-phone"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                placeholder="+96170000000"
                inputMode="tel"
                disabled={!!editing}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="emp-email">
                {t("auth.email")}{" "}
                <span className="text-xs text-muted-foreground">({t("common.optionalField")})</span>
              </Label>
              <Input
                id="emp-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              />
            </div>

            {editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="emp-reset-password">
                  <KeyRound className="me-1 inline h-3 w-3" />
                  {t("employees.password")}
                </Label>
                <Input
                  id="emp-reset-password"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder={t("employees.passwordHint")}
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="emp-password">{t("employees.password")}</Label>
                <Input
                  id="emp-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">{t("employees.passwordHint")}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("employees.role")}</Label>
                <Select
                  value={form.role}
                  onValueChange={(v) => setForm((p) => ({ ...p, role: v as ManagedRole }))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={t("employees.selectRole")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STAFF">{t("employees.staff")}</SelectItem>
                    <SelectItem value="ADMIN">{t("employees.admin")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.role === "ADMIN" ? t("employees.adminHint") : t("employees.staffHint")}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.status")}</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm((p) => ({ ...p, status: v as ManagedStatus }))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder={t("employees.selectStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">{t("common.active")}</SelectItem>
                    <SelectItem value="INACTIVE">{t("common.inactive")}</SelectItem>
                    <SelectItem value="SUSPENDED">{t("common.warning")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending
                ? t("common.loading")
                : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title={t("employees.deleteTitle")}
        description={t("employees.deleteDescription")}
        confirmLabel={t("common.delete")}
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
