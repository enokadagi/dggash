"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatCard } from "@/components/ui/stat-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/status-states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  MessageCircle,
  Wifi,
  Layers,
  Receipt,
  Pencil,
  RefreshCw,
  Plus,
  Power,
  Calendar,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { getInitials, formatDate, formatCurrency } from "@/lib/utils";
import { openWhatsAppWeb, buildExpiryReminderText } from "@/lib/whatsapp-link";
import {
  useUpdateSubscription,
  useRenewSubscription,
  useSuspendSubscription,
  useReactivateSubscription,
  useCreateSubscription,
} from "@/hooks/api/use-subscriptions";
import { toast } from "sonner";
import { MapPickerDialog } from "@/components/map/map-picker-dialog";

interface Plan {
  id: string;
  name: string;
  speed: string;
  price: number | string;
  currency: string;
  durationDays: number;
  description?: string | null;
  isActive?: boolean;
}

interface SubscriptionItem {
  id: string;
  planId: string;
  status: string;
  paymentStatus: string;
  startDate: string;
  expiryDate: string;
  notes?: string | null;
  lastRenewalDate?: string | null;
  plan: Plan;
}

interface CustomerDetail {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  whatsappNumber?: string | null;
  avatar?: string | null;
  address?: string | null;
  area?: string | null;
  city?: string | null;
  location?: string | null;
  notes?: string | null;
  status: string;
  createdAt: string;
  subscriptions: SubscriptionItem[];
}

interface SaleItem {
  id: string;
  quantity: number;
  unitPrice: number;
  product: { name: string; sku: string };
}

interface Sale {
  id: string;
  saleNumber: string;
  totalAmount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  createdAt: string;
  items: SaleItem[];
}

interface PlansResponse {
  data: Plan[];
  total: number;
  page: number;
  limit: number;
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLocalization();
  const [id, setId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setId(new URLSearchParams(window.location.search).get("id") || "");
  }, []);

  // Dialog states
  const [editCustomerOpen, setEditCustomerOpen] = React.useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = React.useState(false);
  const [editSubDialogOpen, setEditSubDialogOpen] = React.useState(false);
  const [assignPlanDialogOpen, setAssignPlanDialogOpen] = React.useState(false);
  const [mapPickerOpen, setMapPickerOpen] = React.useState(false);

  // Active target subscription for modals
  const [selectedSub, setSelectedSub] = React.useState<SubscriptionItem | null>(null);

  // Queries
  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/customers/${id}`),
    enabled: Boolean(id),
  });

  const { data: salesData } = useQuery({
    queryKey: ["customer-sales", id],
    queryFn: () =>
      api.get<{ data: Sale[]; total: number }>("/sales", { customerId: id || undefined, limit: 50 }),
    enabled: !!customer?.id,
  });

  const { data: plansData } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<PlansResponse>("/plans", { page: 1, limit: 100 }),
  });

  // Subscription Mutations
  const updateSubMutation = useUpdateSubscription();
  const renewSubMutation = useRenewSubscription();
  const suspendSubMutation = useSuspendSubscription();
  const reactivateSubMutation = useReactivateSubscription();
  const createSubMutation = useCreateSubscription();

  // Forms state
  const [customerForm, setCustomerForm] = React.useState({
    firstName: "",
    lastName: "",
    phone: "",
    whatsappNumber: "",
    email: "",
    address: "",
    city: "",
    location: "",
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    notes: "",
    status: "active",
  });

  const [renewForm, setRenewForm] = React.useState({
    planId: "",
    durationDays: 30,
  });

  const [editSubForm, setEditSubForm] = React.useState({
    planId: "",
    startDate: "",
    expiryDate: "",
    paymentStatus: "paid",
    notes: "",
  });

  const [assignPlanForm, setAssignPlanForm] = React.useState({
    planId: "",
    startDate: new Date().toISOString().split("T")[0],
    durationDays: 30,
    paymentStatus: "paid",
    notes: "",
  });

  // Populate Customer Form when opening dialog
  const openEditCustomer = () => {
    if (!customer) return;
    setCustomerForm({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      phone: customer.phone || "",
      whatsappNumber: customer.whatsappNumber || "",
      email: customer.email || "",
      address: customer.address || "",
      city: customer.city || "",
      location: customer.location || "",
      latitude: undefined,
      longitude: undefined,
      notes: customer.notes || "",
      status: customer.status || "active",
    });
    setEditCustomerOpen(true);
  };

  // Customer Update Mutation
  const updateCustomerMutation = useMutation({
    mutationFn: (data: typeof customerForm) => api.patch(`/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditCustomerOpen(false);
      toast.success("Customer details updated successfully");
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to update customer details");
    },
  });

  // Open Renew Dialog
  const openRenewModal = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setRenewForm({
      planId: sub.planId,
      durationDays: sub.plan.durationDays || 30,
    });
    setRenewDialogOpen(true);
  };

  // Open Edit Subscription Dialog
  const openEditSubModal = (sub: SubscriptionItem) => {
    setSelectedSub(sub);
    setEditSubForm({
      planId: sub.planId,
      startDate: sub.startDate ? sub.startDate.split("T")[0] : "",
      expiryDate: sub.expiryDate ? sub.expiryDate.split("T")[0] : "",
      paymentStatus: sub.paymentStatus || "paid",
      notes: sub.notes || "",
    });
    setEditSubDialogOpen(true);
  };

  // Handle Renew Submission
  const handleRenewSubmit = () => {
    if (!selectedSub) return;
    renewSubMutation.mutate(
      {
        id: selectedSub.id,
        data: {
          planId: renewForm.planId || undefined,
          durationDays: Number(renewForm.durationDays) || undefined,
        },
      },
      {
        onSuccess: () => {
          setRenewDialogOpen(false);
        },
      },
    );
  };

  // Handle Edit Subscription Submission
  const handleEditSubSubmit = () => {
    if (!selectedSub) return;
    updateSubMutation.mutate(
      {
        id: selectedSub.id,
        data: {
          planId: editSubForm.planId || undefined,
          startDate: editSubForm.startDate ? new Date(editSubForm.startDate).toISOString() : undefined,
          expiryDate: editSubForm.expiryDate ? new Date(editSubForm.expiryDate).toISOString() : undefined,
          paymentStatus: editSubForm.paymentStatus as any,
          notes: editSubForm.notes || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditSubDialogOpen(false);
        },
      },
    );
  };

  // Handle Assign New Subscription Submission
  const handleAssignPlanSubmit = () => {
    if (!id) return;
    if (!assignPlanForm.planId) {
      toast.error("Please select a plan");
      return;
    }
    createSubMutation.mutate(
      {
        customerId: id,
        planId: assignPlanForm.planId,
        startDate: assignPlanForm.startDate
          ? new Date(assignPlanForm.startDate).toISOString()
          : new Date().toISOString(),
        durationDays: Number(assignPlanForm.durationDays) || 30,
        paymentStatus: assignPlanForm.paymentStatus as any,
        autoRenew: true,
        notes: assignPlanForm.notes || undefined,
      },
      {
        onSuccess: () => {
          setAssignPlanDialogOpen(false);
        },
      },
    );
  };

  const subscriptions = customer?.subscriptions || [];
  const activeSub = subscriptions.find(
    (s) => s.status === "ACTIVE" || s.status === "EXPIRING_SOON",
  ) || subscriptions[0];

  const totalSpent = (salesData?.data || []).reduce((sum, s) => sum + Number(s.totalAmount), 0);

  // Expiry countdown calculation
  const expiryInfo = React.useMemo(() => {
    if (!activeSub?.expiryDate) return null;
    const now = new Date();
    const expiry = new Date(activeSub.expiryDate);
    const diffMs = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `Expired ${Math.abs(diffDays)}d ago`, variant: "destructive" as const, days: diffDays };
    }
    if (diffDays === 0) {
      return { text: "Expires today!", variant: "destructive" as const, days: 0 };
    }
    if (diffDays <= 3) {
      return { text: `Expires in ${diffDays}d`, variant: "warning" as const, days: diffDays };
    }
    return { text: `${diffDays} days remaining`, variant: "success" as const, days: diffDays };
  }, [activeSub]);

  if (id === null || isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <div className="py-20 text-center">
        <EmptyState message="Customer not found or error loading details" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={`${customer.firstName} ${customer.lastName}`}
        description={`Account #${customer.id.slice(0, 8)} • Phone: ${customer.phone}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="me-1.5 h-4 w-4" />
              {t("common.back") || "Back"}
            </Button>
            <Button size="sm" onClick={openEditCustomer}>
              <Pencil className="me-1.5 h-4 w-4" />
              Edit Profile
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Left Column: Customer Profile Card */}
        <Card className="lg:col-span-1 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <Avatar className="h-20 w-20 ring-2 ring-primary/20">
                <AvatarImage src={customer.avatar || undefined} />
                <AvatarFallback className="text-xl bg-primary/10 text-primary font-bold">
                  {getInitials(customer.firstName, customer.lastName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-bold">
                  {customer.firstName} {customer.lastName}
                </h3>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <StatusBadge status={customer.status} />
                </div>
              </div>

              <div className="w-full space-y-2.5 text-sm border-t border-border pt-4">
                <div className="flex items-center gap-2.5 text-foreground">
                  <Phone className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-mono text-xs">{customer.phone}</span>
                </div>
                {customer.email && (
                  <div className="flex items-center gap-2.5 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate text-xs">{customer.email}</span>
                  </div>
                )}
                {customer.whatsappNumber && (
                  <div className="flex items-center gap-2.5 text-green-600 dark:text-green-400">
                    <MessageCircle className="h-4 w-4 shrink-0" />
                    <span className="font-mono text-xs">{customer.whatsappNumber}</span>
                  </div>
                )}
                {(customer.address || customer.city || customer.area) && (
                  <div className="flex items-start gap-2.5 text-muted-foreground text-start">
                    <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="text-xs">
                      {[customer.city, customer.area, customer.address].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}
                {customer.location && (
                  <a
                    href={
                      customer.location.startsWith("http")
                        ? customer.location
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.location)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-primary font-mono bg-primary/5 hover:bg-primary/10 p-2 rounded text-start transition-colors border border-primary/20"
                    title="Open in Google Maps"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">GPS: {customer.location}</span>
                  </a>
                )}
                {customer.notes && (
                  <div className="text-xs text-muted-foreground italic bg-muted/40 p-2 rounded text-start">
                    &quot;{customer.notes}&quot;
                  </div>
                )}

                {/* Free WhatsApp Actions */}
                <div className="space-y-2 pt-3">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white text-xs h-9 shadow-sm"
                    onClick={() =>
                      openWhatsAppWeb(
                        customer.whatsappNumber || customer.phone,
                        `Hello ${customer.firstName}, this is AWIK NET Internet Service Provider. How can we help you today?`,
                      )
                    }
                  >
                    <MessageCircle className="me-1.5 h-4 w-4" />
                    Chat on WhatsApp (Free)
                  </Button>

                  {activeSub && (
                    <Button
                      variant="outline"
                      className="w-full text-xs h-9 border-green-600/40 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
                      onClick={() => {
                        const msg = buildExpiryReminderText({
                          customerName: `${customer.firstName} ${customer.lastName}`,
                          planName: activeSub.plan.name,
                          expiryDate: activeSub.expiryDate,
                          daysRemaining: expiryInfo?.days ?? 0,
                          price: formatCurrency(Number(activeSub.plan.price), activeSub.plan.currency),
                        });
                        openWhatsAppWeb(customer.whatsappNumber || customer.phone, msg);
                      }}
                    >
                      <Clock className="me-1.5 h-3.5 w-3.5" />
                      Send Expiry Reminder (Free)
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Main Column */}
        <div className="lg:col-span-3 space-y-6">
          {/* Top Quick Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Active Plan" value={activeSub?.plan.name || "None"} icon={Wifi} />
            <StatCard
              title="Plan Status"
              value={activeSub ? activeSub.status : "No Plan"}
              description={expiryInfo?.text}
              icon={Clock}
            />
            <StatCard title="Total Spent" value={formatCurrency(totalSpent)} icon={Receipt} />
            <StatCard
              title="Member Since"
              value={formatDate(customer.createdAt)}
              icon={Calendar}
            />
          </div>

          {/* Active Internet Plan Hero Card */}
          {activeSub ? (
            <Card className="border-primary/40 shadow-sm bg-gradient-to-br from-card to-primary/5">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="rounded-xl bg-primary p-2 text-primary-foreground">
                      <Wifi className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {activeSub.plan.name}
                        <StatusBadge status={activeSub.status} />
                      </CardTitle>
                      <CardDescription>
                        Speed: <span className="font-semibold text-foreground">{activeSub.plan.speed}</span> •{" "}
                        {activeSub.plan.durationDays} Days cycle •{" "}
                        <span className="font-semibold text-primary">
                          {formatCurrency(Number(activeSub.plan.price), activeSub.plan.currency)}
                        </span>
                      </CardDescription>
                    </div>
                  </div>

                  {expiryInfo && (
                    <Badge
                      variant={
                        expiryInfo.variant === "destructive"
                          ? "destructive"
                          : expiryInfo.variant === "warning"
                          ? "warning"
                          : "success"
                      }
                      className="text-xs px-3 py-1 font-semibold"
                    >
                      {expiryInfo.text}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3 rounded-lg bg-background/80 p-3 border border-border/80">
                  <div>
                    <span className="text-xs text-muted-foreground">Start Date</span>
                    <p className="font-medium text-sm">{formatDate(activeSub.startDate)}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Expiry Date</span>
                    <p className="font-medium text-sm text-foreground flex items-center gap-1.5">
                      {formatDate(activeSub.expiryDate)}
                      {expiryInfo?.days !== undefined && expiryInfo.days <= 3 && (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      )}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Payment Status</span>
                    <div className="font-medium text-sm capitalize mt-0.5">
                      <Badge variant={activeSub.paymentStatus === "paid" ? "success" : "secondary"}>
                        {activeSub.paymentStatus || "paid"}
                      </Badge>
                    </div>
                  </div>
                </div>

                {activeSub.notes && (
                  <p className="text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/40">
                    <span className="font-semibold">Connection Notes:</span> {activeSub.notes}
                  </p>
                )}

                {/* Plan Action Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    onClick={() => openRenewModal(activeSub)}
                  >
                    <RefreshCw className="me-1.5 h-3.5 w-3.5" />
                    Renew / Extend Plan
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditSubModal(activeSub)}
                  >
                    <Pencil className="me-1.5 h-3.5 w-3.5" />
                    Edit / Change Plan
                  </Button>

                  {activeSub.status === "SUSPENDED" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-green-600 border-green-600/30 hover:bg-green-50 dark:hover:bg-green-950/30"
                      onClick={() => reactivateSubMutation.mutate(activeSub.id)}
                      disabled={reactivateSubMutation.isPending}
                    >
                      <Power className="me-1.5 h-3.5 w-3.5" />
                      Reactivate Service
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-amber-600 border-amber-600/30 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                      onClick={() => suspendSubMutation.mutate(activeSub.id)}
                      disabled={suspendSubMutation.isPending}
                    >
                      <Power className="me-1.5 h-3.5 w-3.5" />
                      Suspend Service
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="ms-auto"
                    onClick={() => {
                      setAssignPlanForm({
                        planId: activeSub.planId,
                        startDate: new Date().toISOString().split("T")[0],
                        durationDays: activeSub.plan.durationDays || 30,
                        paymentStatus: "paid",
                        notes: "",
                      });
                      setAssignPlanDialogOpen(true);
                    }}
                  >
                    <Plus className="me-1.5 h-3.5 w-3.5" />
                    Assign New Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed p-6 text-center">
              <Wifi className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="font-semibold text-foreground">No Active Internet Plan</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                This subscriber does not currently have an active internet service plan.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={() => setAssignPlanDialogOpen(true)}
              >
                <Plus className="me-1.5 h-4 w-4" />
                Assign Internet Plan Now
              </Button>
            </Card>
          )}

          {/* Tabs: Subscriptions & Sales History */}
          <Tabs defaultValue="subscriptions">
            <TabsList className="flex-wrap">
              <TabsTrigger value="subscriptions">
                <Layers className="me-1.5 h-4 w-4" />
                Subscription History ({subscriptions.length})
              </TabsTrigger>
              <TabsTrigger value="sales">
                <Receipt className="me-1.5 h-4 w-4" />
                Sales History ({salesData?.data?.length || 0})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="subscriptions" className="space-y-4">
              <Card>
                <CardHeader className="py-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-base">All Customer Subscriptions</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAssignPlanDialogOpen(true)}
                  >
                    <Plus className="me-1 h-3.5 w-3.5" />
                    Add Subscription
                  </Button>
                </CardHeader>
                <CardContent className="pt-0">
                  {subscriptions.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No subscription records found
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan & Speed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Start Date</TableHead>
                          <TableHead>Expiry Date</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead className="text-end">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscriptions.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell>
                              <div className="font-medium text-foreground">{sub.plan.name}</div>
                              <span className="text-xs text-muted-foreground">{sub.plan.speed}</span>
                            </TableCell>
                            <TableCell>
                              <StatusBadge status={sub.status} />
                            </TableCell>
                            <TableCell className="font-semibold">
                              {formatCurrency(Number(sub.plan.price), sub.plan.currency)}
                            </TableCell>
                            <TableCell className="text-xs">{formatDate(sub.startDate)}</TableCell>
                            <TableCell className="text-xs font-medium">
                              {formatDate(sub.expiryDate)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={sub.paymentStatus === "paid" ? "success" : "secondary"}
                                className="text-[11px]"
                              >
                                {sub.paymentStatus || "paid"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-end">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => openRenewModal(sub)}
                                >
                                  <RefreshCw className="me-1 h-3 w-3" />
                                  Renew
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2 text-xs"
                                  onClick={() => openEditSubModal(sub)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sales">
              <Card>
                <CardContent className="pt-6">
                  {(salesData?.data || []).length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">No sales yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Sale #</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Payment</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(salesData?.data || []).map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-mono text-sm">{sale.saleNumber}</TableCell>
                            <TableCell>
                              <span className="text-xs text-muted-foreground">
                                {sale.items.map((i) => i.product.name).join(", ")}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium">
                              {formatCurrency(Number(sale.totalAmount), sale.currency)}
                            </TableCell>
                            <TableCell className="capitalize">
                              {sale.paymentMethod.replace(/_/g, " ")}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sale.status === "COMPLETED" ? "success" : "secondary"}>
                                {sale.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{formatDate(sale.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* DIALOG 1: Edit Customer Profile */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Customer Profile</DialogTitle>
            <DialogDescription>Update subscriber identity, phone number, and address.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cust-fn">First Name *</Label>
                <Input
                  id="cust-fn"
                  value={customerForm.firstName}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-ln">Last Name *</Label>
                <Input
                  id="cust-ln"
                  value={customerForm.lastName}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-phone">Phone Number (E.164) *</Label>
              <Input
                id="cust-phone"
                value={customerForm.phone}
                onChange={(e) => setCustomerForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-wa">WhatsApp Number</Label>
              <Input
                id="cust-wa"
                value={customerForm.whatsappNumber}
                onChange={(e) => setCustomerForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-email">Email Address</Label>
              <Input
                id="cust-email"
                type="email"
                value={customerForm.email}
                onChange={(e) => setCustomerForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cust-city">City</Label>
                <Input
                  id="cust-city"
                  value={customerForm.city}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, city: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-status">Account Status</Label>
                <select
                  id="cust-status"
                  value={customerForm.status}
                  onChange={(e) => setCustomerForm((f) => ({ ...f, status: e.target.value }))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-addr">Address</Label>
              <Textarea
                id="cust-addr"
                rows={2}
                value={customerForm.address}
                onChange={(e) => setCustomerForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-location">Map Coordinates / GPS</Label>
              <div className="flex gap-2">
                <Input
                  id="cust-location"
                  value={customerForm.location}
                  onChange={(e) => {
                    const val = e.target.value;
                    const parts = val.split(",").map((s) => parseFloat(s.trim()));
                    const lat = parts.length === 2 && !isNaN(parts[0]) ? parts[0] : undefined;
                    const lng = parts.length === 2 && !isNaN(parts[1]) ? parts[1] : undefined;
                    setCustomerForm((f) => ({ ...f, location: val, latitude: lat, longitude: lng }));
                  }}
                  placeholder="e.g. 34.43670, 35.84970 or Google Maps URL"
                  className="font-mono text-xs flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setMapPickerOpen(true)}
                  className="shrink-0 text-primary border-primary/30 hover:bg-primary/5 text-xs h-9"
                >
                  <MapPin className="me-1 h-3.5 w-3.5" />
                  Pick on Map
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-notes">Notes</Label>
              <Textarea
                id="cust-notes"
                rows={2}
                value={customerForm.notes}
                onChange={(e) => setCustomerForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCustomerOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => updateCustomerMutation.mutate(customerForm)}
              disabled={updateCustomerMutation.isPending || !customerForm.firstName || !customerForm.phone}
            >
              {updateCustomerMutation.isPending && (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MapPickerDialog
        open={mapPickerOpen}
        onOpenChange={setMapPickerOpen}
        initialLocationText={customerForm.location}
        onConfirm={(lat, lng, locStr) => {
          setCustomerForm((f) => ({ ...f, location: locStr, latitude: lat, longitude: lng }));
        }}
      />

      {/* DIALOG 2: Renew Subscription */}
      <Dialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renew Subscription</DialogTitle>
            <DialogDescription>
              Extend subscriber plan duration and compute the next renewal cycle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="renew-plan">Select Plan</Label>
              <select
                id="renew-plan"
                value={renewForm.planId}
                onChange={(e) => {
                  const target = plansData?.data.find((p) => p.id === e.target.value);
                  setRenewForm({
                    planId: e.target.value,
                    durationDays: target ? target.durationDays : 30,
                  });
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                {(plansData?.data || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.speed}) — {formatCurrency(Number(p.price), p.currency)} / {p.durationDays}d
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="renew-days">Duration to add (Days)</Label>
              <Input
                id="renew-days"
                type="number"
                min="1"
                value={renewForm.durationDays}
                onChange={(e) =>
                  setRenewForm((f) => ({ ...f, durationDays: Number(e.target.value) }))
                }
              />
            </div>

            {selectedSub && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 border border-border/60">
                <p className="text-muted-foreground">Current Expiry: {formatDate(selectedSub.expiryDate)}</p>
                <p className="font-semibold text-primary">
                  Extension: +{renewForm.durationDays} days from{" "}
                  {new Date(selectedSub.expiryDate) > new Date() ? "current expiry" : "today"}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenewSubmit} disabled={renewSubMutation.isPending}>
              {renewSubMutation.isPending && (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              )}
              Confirm Renewal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 3: Edit / Change Subscription */}
      <Dialog open={editSubDialogOpen} onOpenChange={setEditSubDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subscription Details</DialogTitle>
            <DialogDescription>
              Change plan package, adjust dates, or update payment status.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-plan">Internet Plan</Label>
              <select
                id="edit-plan"
                value={editSubForm.planId}
                onChange={(e) => setEditSubForm((f) => ({ ...f, planId: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                {(plansData?.data || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.speed}) — {formatCurrency(Number(p.price), p.currency)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-start">Start Date</Label>
                <Input
                  id="edit-start"
                  type="date"
                  value={editSubForm.startDate}
                  onChange={(e) => setEditSubForm((f) => ({ ...f, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-expiry">Expiry Date</Label>
                <Input
                  id="edit-expiry"
                  type="date"
                  value={editSubForm.expiryDate}
                  onChange={(e) => setEditSubForm((f) => ({ ...f, expiryDate: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-pay">Payment Status</Label>
              <select
                id="edit-pay"
                value={editSubForm.paymentStatus}
                onChange={(e) => setEditSubForm((f) => ({ ...f, paymentStatus: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="partially_paid">Partially Paid</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Notes / Technical info</Label>
              <Input
                id="edit-notes"
                value={editSubForm.notes}
                onChange={(e) => setEditSubForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="PPPoE user, port info..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSubDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSubSubmit} disabled={updateSubMutation.isPending}>
              {updateSubMutation.isPending && (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              )}
              Save Plan Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG 4: Assign New Subscription */}
      <Dialog open={assignPlanDialogOpen} onOpenChange={setAssignPlanDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign Internet Service Plan</DialogTitle>
            <DialogDescription>
              Create a new subscription for this subscriber.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="assign-plan">Select Internet Plan *</Label>
              <select
                id="assign-plan"
                value={assignPlanForm.planId}
                onChange={(e) => {
                  const target = plansData?.data.find((p) => p.id === e.target.value);
                  setAssignPlanForm((f) => ({
                    ...f,
                    planId: e.target.value,
                    durationDays: target ? target.durationDays : 30,
                  }));
                }}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="">-- Choose a Plan --</option>
                {(plansData?.data || [])
                  .filter((p) => p.isActive)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.speed}) — {formatCurrency(Number(p.price), p.currency)} /{" "}
                      {p.durationDays}d
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="assign-start">Start Date *</Label>
                <Input
                  id="assign-start"
                  type="date"
                  value={assignPlanForm.startDate}
                  onChange={(e) =>
                    setAssignPlanForm((f) => ({ ...f, startDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assign-dur">Duration (Days)</Label>
                <Input
                  id="assign-dur"
                  type="number"
                  min="1"
                  value={assignPlanForm.durationDays}
                  onChange={(e) =>
                    setAssignPlanForm((f) => ({ ...f, durationDays: Number(e.target.value) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-pay">Payment Status</Label>
              <select
                id="assign-pay"
                value={assignPlanForm.paymentStatus}
                onChange={(e) =>
                  setAssignPlanForm((f) => ({ ...f, paymentStatus: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="paid">Paid (Activate immediately)</option>
                <option value="pending">Pending</option>
                <option value="partially_paid">Partially Paid</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assign-notes">Notes / Device credentials</Label>
              <Input
                id="assign-notes"
                value={assignPlanForm.notes}
                onChange={(e) =>
                  setAssignPlanForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="PPPoE username, fiber port..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignPlanDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAssignPlanSubmit}
              disabled={createSubMutation.isPending || !assignPlanForm.planId}
            >
              {createSubMutation.isPending && (
                <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
              )}
              Assign Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}