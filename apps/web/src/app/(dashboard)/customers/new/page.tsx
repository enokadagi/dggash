"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  ArrowLeft,
  MapPin,
  Wifi,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Copy,
  CreditCard,
  User,
  Navigation,
} from "lucide-react";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import {
  createCustomerWithPlanSchema,
  type CreateCustomerWithPlanInput,
} from "@/lib/validations/customer.schema";
import { MapPickerDialog } from "@/components/map/map-picker-dialog";

interface Plan {
  id: string;
  name: string;
  description?: string | null;
  speed: string;
  durationDays: number;
  price: number | string;
  currency: string;
  isActive: boolean;
}

interface PlansResponse {
  data: Plan[];
  total: number;
  page: number;
  limit: number;
}

export default function NewCustomerPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLocalization();

  const [isLocating, setIsLocating] = React.useState(false);
  const [locationError, setLocationError] = React.useState<string | null>(null);
  const [mapPickerOpen, setMapPickerOpen] = React.useState(false);

  // Fetch available internet plans
  const { data: plansData, isLoading: isLoadingPlans } = useQuery({
    queryKey: ["plans"],
    queryFn: () => api.get<PlansResponse>("/plans", { page: 1, limit: 100 }),
  });

  const activePlans = React.useMemo(() => {
    return (plansData?.data || []).filter((p) => p.isActive);
  }, [plansData]);

  const todayStr = React.useMemo(() => {
    return new Date().toISOString().split("T")[0];
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCustomerWithPlanInput>({
    resolver: zodResolver(createCustomerWithPlanSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      whatsappNumber: "",
      email: "",
      address: "",
      city: "",
      region: "",
      zone: "",
      location: "",
      latitude: undefined,
      longitude: undefined,
      notes: "",
      planId: "",
      startDate: todayStr,
      durationDays: 30,
      paymentStatus: "paid",
      subscriptionNotes: "",
    },
  });

  const selectedPlanId = watch("planId");
  const selectedLocation = watch("location") || "";
  const phoneValue = watch("phone");

  const selectedPlan = React.useMemo(() => {
    return activePlans.find((p) => p.id === selectedPlanId);
  }, [activePlans, selectedPlanId]);

  // When a plan is picked, auto-fill its durationDays
  const handleSelectPlan = (plan: Plan) => {
    setValue("planId", plan.id, { shouldValidate: true, shouldDirty: true });
    setValue("durationDays", plan.durationDays, { shouldValidate: true, shouldDirty: true });
  };

  const handleCopyPhoneToWhatsapp = () => {
    if (phoneValue) {
      setValue("whatsappNumber", phoneValue, { shouldValidate: true, shouldDirty: true });
      toast.info("Phone copied to WhatsApp number");
    }
  };

  const handleUseCurrentLocation = () => {
    setLocationError(null);
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser. Please enter coordinates manually.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        setValue("latitude", latitude, { shouldDirty: true, shouldValidate: true });
        setValue("longitude", longitude, { shouldDirty: true, shouldValidate: true });
        setValue("location", `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, {
          shouldDirty: true,
          shouldValidate: true,
        });
        toast.success("Location coordinates captured");
      },
      (error) => {
        setIsLocating(false);
        let msg = "Unable to access current location.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "GPS location is not available in this browser (requires HTTPS). Please use the 'Pick on Map' button instead.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Location request timed out. Please use the 'Pick on Map' button or enter coordinates manually.";
        }
        setLocationError(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  };

  const createCustomerMutation = useMutation({
    mutationFn: async (data: CreateCustomerWithPlanInput) => {
      // 1. Create the customer record
      const customerPayload = {
        phone: data.phone.trim(),
        email: data.email?.trim() || undefined,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        whatsappNumber: data.whatsappNumber?.trim() || undefined,
        address: data.address?.trim() || undefined,
        area: [data.region?.trim(), data.zone?.trim()].filter(Boolean).join(" / ") || undefined,
        location: data.location?.trim() || undefined,
        latitude: data.latitude,
        longitude: data.longitude,
        city: data.city?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        status: "active",
      };

      const customer = await api.post<{ id: string; firstName: string; lastName: string }>(
        "/customers",
        customerPayload,
      );

      // 2. Create the initial subscription with chosen plan
      const subscriptionPayload = {
        customerId: customer.id,
        planId: data.planId,
        startDate: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
        durationDays: data.durationDays ? Number(data.durationDays) : undefined,
        paymentStatus: data.paymentStatus || "paid",
        notes: data.subscriptionNotes?.trim() || undefined,
      };

      await api.post("/subscriptions", subscriptionPayload);

      return customer;
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
      toast.success(
        `Customer ${customer.firstName} ${customer.lastName} created and plan activated successfully!`,
      );
      router.push(`/customers/view?id=${encodeURIComponent(customer.id)}`);
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "Failed to create customer and assign plan");
    },
  });

  const onSubmit = (data: CreateCustomerWithPlanInput) => {
    createCustomerMutation.mutate(data);
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Add New Customer"
        description="Register a new subscriber and assign their internet service plan"
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {t("common.back") || "Back"}
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: Internet Service Plan (REQUIRED) */}
        <Card className="border-primary/30 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Wifi className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">1. Choose Internet Plan *</CardTitle>
                  <CardDescription>
                    Select the service package and speed requested by the customer
                  </CardDescription>
                </div>
              </div>
              {selectedPlan && (
                <Badge variant="success" className="px-3 py-1 text-xs">
                  Selected: {selectedPlan.name}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingPlans ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                Loading service plans...
              </div>
            ) : activePlans.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-amber-500 mb-2" />
                <p className="text-sm font-medium">No active internet plans found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Please configure service plans under the Plans section before adding customers.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => router.push("/plans")}
                >
                  Go to Plans
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activePlans.map((plan) => {
                  const isSelected = selectedPlanId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => handleSelectPlan(plan)}
                      className={`relative cursor-pointer rounded-xl border p-4 transition-all duration-150 hover:border-primary ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-2 ring-primary ring-offset-1"
                          : "border-border bg-card hover:bg-accent/40"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-foreground">{plan.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <span className="font-medium text-primary">{plan.speed}</span>
                            <span>•</span>
                            <span>{plan.durationDays} Days</span>
                          </div>
                        </div>
                        {isSelected ? (
                          <CheckCircle2 className="h-5 w-5 text-primary fill-primary/20" />
                        ) : (
                          <div className="h-5 w-5 rounded-full border border-muted-foreground/30" />
                        )}
                      </div>
                      <div className="mt-3 flex items-baseline justify-between pt-2 border-t border-border/50">
                        <span className="text-lg font-bold text-foreground">
                          {formatCurrency(Number(plan.price), plan.currency)}
                        </span>
                        <span className="text-xs text-muted-foreground">/{plan.durationDays}d</span>
                      </div>
                      {plan.description && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">{plan.description}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {errors.planId && (
              <p className="text-xs font-medium text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {errors.planId.message}
              </p>
            )}

            {/* Plan Subscription Details */}
            {selectedPlan && (
              <div className="mt-4 rounded-lg bg-muted/40 p-4 border border-border/60">
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="startDate" className="text-xs flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      Subscription Start Date *
                    </Label>
                    <Input id="startDate" type="date" {...register("startDate")} className="bg-background" />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="durationDays" className="text-xs">
                      Duration (Days)
                    </Label>
                    <Input
                      id="durationDays"
                      type="number"
                      min="1"
                      {...register("durationDays")}
                      className="bg-background"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="paymentStatus" className="text-xs flex items-center gap-1.5">
                      <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                      Initial Payment Status
                    </Label>
                    <select
                      id="paymentStatus"
                      {...register("paymentStatus")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="paid">Paid (Activated immediately)</option>
                      <option value="pending">Pending (Unpaid)</option>
                      <option value="partially_paid">Partially Paid</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="subscriptionNotes" className="text-xs">
                    Subscription / Connection Notes (PPPoE, Port, Device Info)
                  </Label>
                  <Input
                    id="subscriptionNotes"
                    placeholder="e.g. PPPoE user: user_01 / Fiber box Port 3"
                    {...register("subscriptionNotes")}
                    className="bg-background"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Customer Personal & Contact Profile */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">2. Customer Profile *</CardTitle>
                  <CardDescription>Personal identification and contact details</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("auth.firstName")} *</Label>
                  <Input id="firstName" placeholder="First name" {...register("firstName")} />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("auth.lastName")} *</Label>
                  <Input id="lastName" placeholder="Last name" {...register("lastName")} />
                  {errors.lastName && (
                    <p className="text-xs text-destructive">{errors.lastName.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="phone">{t("customers.phone")} *</Label>
                  <span className="text-xs text-muted-foreground">E.164 format (e.g. +96170123456)</span>
                </div>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+96170000000"
                  {...register("phone")}
                  onChange={(e) => {
                    let val = e.target.value.trim();
                    // Auto-prefix '+' if user types country code without it
                    if (val && !val.startsWith("+") && /^[1-9]/.test(val)) {
                      val = `+${val}`;
                    }
                    setValue("phone", val, { shouldValidate: true });
                  }}
                />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="whatsappNumber">{t("customers.whatsappNumber")}</Label>
                  {phoneValue && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-primary px-2"
                      onClick={handleCopyPhoneToWhatsapp}
                    >
                      <Copy className="me-1 h-3 w-3" />
                      Copy from phone
                    </Button>
                  )}
                </div>
                <Input
                  id="whatsappNumber"
                  type="tel"
                  placeholder="+96170000000"
                  {...register("whatsappNumber")}
                />
                {errors.whatsappNumber && (
                  <p className="text-xs text-destructive">{errors.whatsappNumber.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("customers.email")}</Label>
                <Input id="email" type="email" placeholder="customer@example.com" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Step 3: Installation Address & Geolocation */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <MapPin className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">3. Address & Location</CardTitle>
                  <CardDescription>Service installation address and map coordinates</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">{t("customers.address")}</Label>
                <Textarea
                  id="address"
                  rows={2}
                  placeholder="Building name, Floor, Street..."
                  {...register("address")}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="city">{t("customers.city")}</Label>
                  <Input id="city" placeholder="Tripoli" {...register("city")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="region">{t("customers.region")}</Label>
                  <Input id="region" placeholder="Al Mina" {...register("region")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="zone">{t("customers.zone")}</Label>
                  <Input id="zone" placeholder="Zone B" {...register("zone")} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location">Map Coordinates / GPS</Label>
                <div className="flex gap-2">
                  <Input
                    id="location"
                    value={selectedLocation}
                    onChange={(e) => {
                      const val = e.target.value;
                      setValue("location", val, { shouldDirty: true });
                      // If user pasted "34.43, 35.84", auto-parse lat/long
                      const parts = val.split(",").map((s) => parseFloat(s.trim()));
                      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                        setValue("latitude", parts[0], { shouldDirty: true });
                        setValue("longitude", parts[1], { shouldDirty: true });
                      }
                    }}
                    placeholder="e.g. 34.43670, 35.84970 or address"
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setMapPickerOpen(true)}
                    className="shrink-0 text-primary border-primary/30 hover:bg-primary/5"
                  >
                    <MapPin className="me-1.5 h-4 w-4" />
                    Pick on Map
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUseCurrentLocation}
                    disabled={isLocating}
                    className="shrink-0"
                  >
                    {isLocating ? (
                      <Loader2 className="me-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="me-1.5 h-4 w-4 text-muted-foreground" />
                    )}
                    {isLocating ? "Locating..." : "Use GPS"}
                  </Button>
                </div>
                {locationError && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded border border-amber-200 dark:border-amber-900/50">
                    {locationError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Click &quot;Pick on Map&quot; to choose location, click &quot;Use GPS&quot;, or paste coordinates.
                </p>

                <MapPickerDialog
                  open={mapPickerOpen}
                  onOpenChange={setMapPickerOpen}
                  initialLocationText={selectedLocation}
                  onConfirm={(lat, lng, locStr) => {
                    setValue("latitude", lat, { shouldDirty: true });
                    setValue("longitude", lng, { shouldDirty: true });
                    setValue("location", locStr, { shouldDirty: true, shouldValidate: true });
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">{t("customers.notes")}</Label>
                <Textarea
                  id="notes"
                  rows={2}
                  placeholder="Installation notes, router serial, subscriber preferences..."
                  {...register("notes")}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions Bar */}
        <div className="flex items-center justify-between border-t border-border pt-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel") || "Cancel"}
          </Button>

          <Button
            type="submit"
            size="lg"
            disabled={createCustomerMutation.isPending || !selectedPlanId}
            className="min-w-[180px]"
          >
            {createCustomerMutation.isPending && (
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
            )}
            Save Customer & Plan
          </Button>
        </div>
      </form>
    </div>
  );
}
