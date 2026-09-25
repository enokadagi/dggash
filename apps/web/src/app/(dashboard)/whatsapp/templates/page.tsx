"use client";

import * as React from "react";
import { ColumnDef } from "@tanstack/react-table";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { usePagination } from "@/hooks/use-pagination";
import { useDebounce } from "@/hooks/use-debounce";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { toast } from "sonner";

interface WhatsAppTemplate {
  id: string;
  name: string;
  key: string;
  type: string;
  subject?: string;
  body: string;
  variables?: string[];
  isActive: boolean;
  language: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TemplatesResponse {
  data: WhatsAppTemplate[];
  total: number;
  page: number;
  limit: number;
}

function TemplateDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: WhatsAppTemplate | null;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [body, setBody] = React.useState("");
  const [description, setDescription] = React.useState("");

  React.useEffect(() => {
    if (open && editing) {
      setName(editing.name);
      setBody(editing.body);
      setDescription(editing.description || "");
    } else if (open) {
      setName("");
      setBody("");
      setDescription("");
    }
  }, [open, editing]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post("/whatsapp/templates", {
        ...(editing ? { key: editing.key } : {}),
        name: name.trim(),
        body: body.trim(),
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      toast.success(editing ? "Template updated" : "Template saved");
      onOpenChange(false);
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to save template");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Template" : "New Template"}</DialogTitle>
          <DialogDescription>
            Templates support variables like {"{{firstName}}"}, {"{{planName}}"}, {"{{expiryDate}}"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name" className="text-xs font-medium text-muted-foreground">
              Name
            </Label>
            <Input
              id="tpl-name"
              placeholder="e.g. reminder_5d"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body" className="text-xs font-medium text-muted-foreground">
              Message body
            </Label>
            <Textarea
              id="tpl-body"
              rows={5}
              placeholder="Hi {{firstName}}, your plan {{planName}} expires on {{expiryDate}}."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-desc" className="text-xs font-medium text-muted-foreground">
              Description (optional)
            </Label>
            <Input
              id="tpl-desc"
              placeholder="e.g. Sent 5 days before plan expiry"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saveMutation.isPending || !name.trim() || !body.trim()}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "Saving..." : editing ? "Save Changes" : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WhatsAppTemplatesPage() {
  const { page, limit, setPage } = usePagination();
  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<WhatsAppTemplate | null>(null);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["whatsapp-templates", page, limit, debouncedSearch],
    queryFn: () =>
      api.get<TemplatesResponse>("/whatsapp/templates", {
        page,
        limit,
        search: debouncedSearch || undefined,
      }),
  });

  const templates = data?.data || [];

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (template: WhatsAppTemplate) => {
    setEditing(template);
    setDialogOpen(true);
  };

  const columns: ColumnDef<WhatsAppTemplate>[] = [
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "Category",
      cell: ({ row }) => <Badge variant="secondary">{row.original.type}</Badge>,
    },
    {
      accessorKey: "variables",
      header: "Body",
      cell: ({ row }) => (
        <div className="min-w-0 max-w-md">
          <p className="truncate text-sm text-muted-foreground">{row.original.body}</p>
        </div>
      ),
    },
    {
      accessorKey: "language",
      header: "Language",
      cell: ({ row }) => <span className="uppercase">{row.original.language}</span>,
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? "success" : "secondary"}>
          {row.original.isActive ? "Active" : "Inactive"}
        </Badge>
      ),
    },
    {
      accessorKey: "updatedAt",
      header: "Last Updated",
      cell: ({ row }) => formatDate(row.original.updatedAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="WhatsApp Templates"
        description="Message templates used for reminders and customer notifications"
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            New Template
          </Button>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : templates.length === 0 ? (
        <EmptyState
          message="No templates yet. Create one to start messaging customers."
          actionLabel="New Template"
          onAction={openCreate}
        />
      ) : (
        <DataTable
          columns={columns}
          data={templates}
          searchPlaceholder="Search templates..."
          onSearch={setSearch}
          page={page}
          totalPages={data ? Math.ceil(data.total / (data.limit || 1)) : 1}
          totalItems={data?.total}
          onPageChange={setPage}
          actions={(row) => [
            { label: "Edit", onClick: () => openEdit(row), icon: <Pencil className="h-4 w-4" /> },
          ]}
        />
      )}

      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}