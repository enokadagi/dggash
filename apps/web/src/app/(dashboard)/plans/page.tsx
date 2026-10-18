"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
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
  const { t } = useLocalization();
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
      toast.success(editingPlan ? t("plansPage.updateSuccess") : t("plansPage.createSuccess"));
    },
    onError: (err: { message?: string }) => toast.error(err.message || t("plansPage.saveError")),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/plans/${id}`, { isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["plans"] }); toast.success(t("plansPage.statusUpdated")); },
    onError: (err: { message?: string }) => toast.error(err.message || t("plansPage.statusError")),
  });

  const update = (field: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const canSave = form.name.trim() && form.speed.trim() && form.durationDays && form.price !== "";

  return <div className="space-y-6">
    <PageHeader title={t("plansPage.title")} description={t("plansPage.description")} actions={<Button onClick={openCreate}><Plus className="me-2 h-4 w-4" />{t("plansPage.newPlan")}</Button>} />
    {isLoading ? <LoadingState /> : error ? <ErrorState message={error.message} onRetry={refetch} /> : !data?.data.length ? <EmptyState message={t("plansPage.noPlans")} actionLabel={t("plansPage.newPlan")} onAction={openCreate} /> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">{data.data.map((plan) => <Card key={plan.id}><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{plan.name}</h2><p className="text-sm text-muted-foreground">{plan.description || t("plansPage.noDescription")}</p></div><Badge variant={plan.isActive ? "success" : "secondary"}>{plan.isActive ? t("common.active") : t("common.inactive")}</Badge></div><div className="text-sm"><p>{plan.speed}</p><p>{t("plansPage.days", { count: plan.durationDays })}</p><p className="text-lg font-semibold">{formatCurrency(Number(plan.price), plan.currency)}</p></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => openEdit(plan)}><Pencil className="me-2 h-4 w-4" />{t("common.edit")}</Button><Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: plan.id, isActive: !plan.isActive })}>{plan.isActive ? t("plansPage.deactivate") : t("plansPage.activate")}</Button></div></CardContent></Card>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>{editingPlan ? t("plansPage.editTitle") : t("plansPage.createTitle")}</DialogTitle><DialogDescription>{editingPlan ? t("plansPage.editDescription") : t("plansPage.createDescription")}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label htmlFor="plan-name">{t("plansPage.nameLabel")}</Label><Input id="plan-name" value={form.name} onChange={update("name")} /></div><div className="space-y-2"><Label htmlFor="plan-speed">{t("plansPage.speedLabel")}</Label><Input id="plan-speed" placeholder="50 Mbps" value={form.speed} onChange={update("speed")} /></div><div className="space-y-2"><Label htmlFor="plan-duration">{t("plansPage.durationLabel")}</Label><Input id="plan-duration" type="number" min="1" value={form.durationDays} onChange={update("durationDays")} /></div><div className="space-y-2"><Label htmlFor="plan-price">{t("plans.price")}</Label><Input id="plan-price" type="number" min="0" step="0.01" value={form.price} onChange={update("price")} /></div><div className="space-y-2"><Label htmlFor="plan-currency">{t("plans.currency")}</Label><Input id="plan-currency" value={form.currency} onChange={update("currency")} /></div><div className="space-y-2"><Label htmlFor="plan-description">{t("common.description")}</Label><Textarea id="plan-description" value={form.description} onChange={update("description")} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button><Button disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? t("plansPage.saving") : editingPlan ? t("plansPage.saveChanges") : t("plansPage.createPlan")}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}