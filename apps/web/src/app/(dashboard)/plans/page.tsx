"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/status-states";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";

interface Plan { id: string; name: string; description?: string | null; speed: string; durationDays: number; price: number | string; currency: string; isActive: boolean; }
interface PlansResponse { data: Plan[]; total: number; page: number; limit: number; }

const EMPTY_FORM = { name: "", description: "", speed: "", durationDays: "30", price: "", currency: "USD" };

export default function PlansPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [editingPlan, setEditingPlan] = React.useState<Plan | null>(null);
  const [form, setForm] = React.useState(EMPTY_FORM);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["plans"], queryFn: () => api.get<PlansResponse>("/plans", { page: 1, limit: 100 }) });

  const openCreate = () => {
    setEditingPlan(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };
  const openEdit = (plan: Plan) => {
    setEditingPlan(plan);
    setForm({
      name: plan.name,
      description: plan.description || "",
      speed: plan.speed,
      durationDays: String(plan.durationDays),
      price: String(plan.price),
      currency: plan.currency || "USD",
    });
    setOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        speed: form.speed.trim(),
        durationDays: Number(form.durationDays),
        price: Number(form.price),
        currency: form.currency.trim() || "USD",
        ...(editingPlan ? { isActive: editingPlan.isActive } : { isActive: true }),
      };
      return editingPlan
        ? api.patch(`/plans/${editingPlan.id}`, payload)
        : api.post("/plans", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      setOpen(false);
      setEditingPlan(null);
      setForm(EMPTY_FORM);
      toast.success(editingPlan ? "Plan updated successfully" : "Plan created successfully");
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to save plan"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/plans/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["plans"] }); toast.success("Plan status updated"); },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to update plan"),
  });

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const canSave = form.name.trim() && form.speed.trim() && form.durationDays && form.price !== "";

  return <div className="space-y-6">
    <PageHeader title="Internet Plans" description="Create and manage AWIK NET service plans" actions={<Button onClick={openCreate}><Plus className="me-2 h-4 w-4" />New Plan</Button>} />
    {isLoading ? <LoadingState /> : error ? <ErrorState message={error.message} onRetry={refetch} /> : !data?.data.length ? <EmptyState message="No plans found" actionLabel="New Plan" onAction={openCreate} /> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.data.map((plan) => <Card key={plan.id}><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{plan.name}</h2><p className="text-sm text-muted-foreground">{plan.description || "No description"}</p></div><Badge variant={plan.isActive ? "success" : "secondary"}>{plan.isActive ? "Active" : "Inactive"}</Badge></div><div className="text-sm"><p>{plan.speed}</p><p>{plan.durationDays} days</p><p className="text-lg font-semibold">{formatCurrency(Number(plan.price), plan.currency)}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(plan)}><Pencil className="me-2 h-4 w-4" />Edit</Button><Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: plan.id, isActive: !plan.isActive })}>{plan.isActive ? "Deactivate" : "Activate"}</Button></div></CardContent></Card>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editingPlan ? "Edit Plan" : "New Internet Plan"}</DialogTitle><DialogDescription>{editingPlan ? "Update the service package and pricing." : "Define the service package and pricing."}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="plan-name">Plan name</Label><Input id="plan-name" value={form.name} onChange={update("name")} /></div><div className="space-y-2"><Label htmlFor="plan-speed">Speed/package</Label><Input id="plan-speed" placeholder="50 Mbps" value={form.speed} onChange={update("speed")} /></div><div className="space-y-2"><Label htmlFor="plan-duration">Duration days</Label><Input id="plan-duration" type="number" min="1" value={form.durationDays} onChange={update("durationDays")} /></div><div className="space-y-2"><Label htmlFor="plan-price">Price</Label><Input id="plan-price" type="number" min="0" step="0.01" value={form.price} onChange={update("price")} /></div><div className="space-y-2"><Label htmlFor="plan-currency">Currency</Label><Input id="plan-currency" value={form.currency} onChange={update("currency")} /></div><div className="space-y-2"><Label htmlFor="plan-description">Description</Label><Textarea id="plan-description" value={form.description} onChange={update("description")} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? "Saving..." : editingPlan ? "Save Changes" : "Create Plan"}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}