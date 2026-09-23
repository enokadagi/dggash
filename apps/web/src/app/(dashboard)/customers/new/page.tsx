"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowLeft } from "lucide-react";
import { useCreateCustomer } from "@/hooks/api/use-customers";
import { createCustomerSchema, type CreateCustomerInput } from "@/lib/validations";
import { useLocalization } from "@/hooks/use-localization";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function NewCustomerPage() {
  const router = useRouter();
  const { t } = useLocalization();
  const createMutation = useCreateCustomer();
  const [locationError, setLocationError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: {
      location: "",
      latitude: undefined,
      longitude: undefined,
    },
  });

  const selectedLocation = watch("location") || "";

  const handleUseCurrentLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Location is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        setValue("latitude", latitude, { shouldDirty: true, shouldValidate: true });
        setValue("longitude", longitude, { shouldDirty: true, shouldValidate: true });
        setValue("location", `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, {
          shouldDirty: true,
          shouldValidate: true,
        });
      },
      () => {
        setLocationError("Unable to access current location. Check browser permissions and try again.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
      },
    );
  };

  const onSubmit = (data: CreateCustomerInput) => {
    const payload = {
      phone: data.phone,
      email: data.email || undefined,
      firstName: data.firstName,
      lastName: data.lastName,
      whatsappNumber: data.whatsappNumber || undefined,
      address: data.address || undefined,
      area: [data.region, data.zone].filter(Boolean).join(" / ") || undefined,
      location: data.location || undefined,
      latitude: data.latitude,
      longitude: data.longitude,
      city: data.city || undefined,
      notes: data.notes || undefined,
    };

    createMutation.mutate(payload, {
      onSuccess: () => router.push("/customers"),
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("customers.addCustomer")}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="me-2 h-4 w-4" />
            {t("common.back")}
          </Button>
        }
      />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("customers.profile")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("auth.firstName")} *</Label>
                  <Input id="firstName" {...register("firstName")} />
                  {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("auth.lastName")} *</Label>
                  <Input id="lastName" {...register("lastName")} />
                  {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t("customers.phone")} *</Label>
                <Input id="phone" type="tel" placeholder="+1234567890" {...register("phone")} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("customers.email")}</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryPhone">{t("customers.secondaryPhone")}</Label>
                <Input id="secondaryPhone" {...register("secondaryPhone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="whatsappNumber">{t("customers.whatsappNumber")}</Label>
                <Input id="whatsappNumber" {...register("whatsappNumber")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">{t("auth.password")}</Label>
                <Input id="password" type="password" {...register("password")} />
                {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("customers.address")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="address">{t("customers.address")}</Label>
                <Textarea id="address" rows={3} {...register("address")} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="region">{t("customers.region")}</Label>
                  <Input id="region" {...register("region")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t("customers.city")}</Label>
                  <Input id="city" {...register("city")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zone">{t("customers.zone")}</Label>
                  <Input id="zone" {...register("zone")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location on map</Label>
                <div className="flex gap-2">
                  <Input
                    id="location"
                    value={selectedLocation}
                    readOnly
                    placeholder="Select current location on map"
                    className="flex-1"
                  />
                  <Button type="button" variant="outline" onClick={handleUseCurrentLocation}>
                    Use my location
                  </Button>
                </div>
                  {locationError && <p className="text-xs text-destructive">{locationError}</p>}
                <p className="text-xs text-muted-foreground">
                  The customer’s current map coordinates will be stored for this address.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t("customers.notes")}</Label>
                <Textarea id="notes" rows={3} {...register("notes")} />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
