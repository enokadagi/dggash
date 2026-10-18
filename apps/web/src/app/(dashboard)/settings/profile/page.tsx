"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FileUpload } from "@/components/ui/file-upload";
import { LoadingState } from "@/components/ui/status-states";
import { useAuth } from "@/hooks/use-auth";
import { useLocalization } from "@/hooks/use-localization";
import { useCompanyProfile } from "@/hooks/api/use-company-settings";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  User,
  Mail,
  Phone,
  Shield,
  Save,
  Loader2,
  KeyRound,
  ImagePlus,
  Trash2,
} from "lucide-react";

const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];
const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export default function ProfilePage() {
  const { t } = useLocalization();
  const { user, setUser } = useAuth();
  const queryClient = useQueryClient();
  const companyProfile = useCompanyProfile();
  const [isSaving, setIsSaving] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [isChanging, setIsChanging] = React.useState(false);
  const [isSavingLogo, setIsSavingLogo] = React.useState(false);
  const [logoError, setLogoError] = React.useState<string | null>(null);
  const [passwordForm, setPasswordForm] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });

  React.useEffect(() => {
    if (user) {
      setForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        phone: user.phone || "",
      });
    }
  }, [user]);

  const invalidateCompanyQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["company-profile"] });
    queryClient.invalidateQueries({ queryKey: ["company-settings"] });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = await api.patch<{ id: string; firstName: string; lastName: string; email: string }>(
        "/auth/profile",
        { firstName: form.firstName, lastName: form.lastName, email: form.email }
      );
      if (user && updated) {
        setUser({ ...user, ...updated });
      }
      toast.success(t("profile.profileUpdated"));
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      toast.error(apiErr.message || t("profile.profileUpdateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const saveLogo = async (value: string) => {
    setIsSavingLogo(true);
    setLogoError(null);
    try {
      await api.patch("/settings/company.logo", { value });
      invalidateCompanyQueries();
      toast.success(t("profile.logoSaved"));
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setLogoError(apiErr.message || t("profile.logoFailed"));
      toast.error(apiErr.message || t("profile.logoFailed"));
    } finally {
      setIsSavingLogo(false);
    }
  };

  const handleLogoFile = (files: File[]) => {
    const file = files[0];
    if (!file) return;
    if (!LOGO_MIME_TYPES.includes(file.type)) {
      setLogoError(t("profile.logoType"));
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError(t("profile.logoTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (dataUrl) void saveLogo(dataUrl);
    };
    reader.onerror = () => setLogoError(t("profile.logoFailed"));
    reader.readAsDataURL(file);
  };

  const handleChangePassword = async () => {
    setPasswordError(null);
    if (passwordForm.newPassword.length < 8) {
      setPasswordError(t("profile.passwordLength"));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t("profile.passwordMismatch"));
      return;
    }
    setIsChanging(true);
    try {
      await api.post("/auth/change-password", passwordForm);
      toast.success(t("profile.passwordChanged"));
      setPasswordOpen(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setPasswordError(apiErr.message || t("profile.passwordChangeFailed"));
    } finally {
      setIsChanging(false);
    }
  };

  if (!user) return <LoadingState />;

  const currentLogo = companyProfile.data?.logo || "";

  return (
    <div className="space-y-6">
      <PageHeader title={t("profile.titleLong")} description={t("profile.managePersonal")} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profile.personalInfo")}</CardTitle>
              <CardDescription>{t("profile.updateNameContact")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("auth.firstName")}</Label>
                  <div className="relative">
                    <User className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="firstName"
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      className="ps-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("auth.lastName")}</Label>
                  <Input
                    id="lastName"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="ps-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("auth.phone")}</Label>
                  <div className="relative">
                    <Phone className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={form.phone}
                      disabled
                      className="ps-9 bg-muted"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("profile.phoneImmutable")}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Save className="me-2 h-4 w-4" />}
                  {t("profile.saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("settings.companyLogo")}</CardTitle>
              <CardDescription>{t("profile.logoHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {currentLogo ? (
                <div className="flex items-center gap-4 rounded-lg border p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote or data-URL logos cannot be next/image optimized in a static export */}
                  <img
                    src={currentLogo}
                    alt={t("settings.companyLogo")}
                    className="h-16 w-auto max-w-[160px] rounded-md border bg-background object-contain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void saveLogo("")}
                    disabled={isSavingLogo}
                  >
                    <Trash2 className="me-2 h-4 w-4 text-destructive" />
                    {t("profile.removeLogo")}
                  </Button>
                </div>
              ) : null}

              <FileUpload
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                multiple={false}
                maxSize={LOGO_MAX_BYTES}
                onFilesChange={handleLogoFile}
                title={t("profile.uploadLogo")}
                hint={t("settings.logoHint")}
              />

              {logoError ? <p className="text-sm text-destructive">{logoError}</p> : null}
              {isSavingLogo ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("profile.logoUploading")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profile.accountDetails")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("profile.role")}</span>
                <span className="text-sm font-medium">
                  {user.role === "ADMIN" ? t("employees.admin") : t("employees.staff")}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("common.status")}</span>
                <span className="text-sm font-medium text-green-600">{t("common.active")}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("profile.memberSince")}</span>
                <span className="text-sm font-medium">
                  {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("profile.lastLogin")}</span>
                <span className="text-sm font-medium">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("profile.security")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("profile.twoFactor")}</span>
                <span className="text-sm font-medium">
                  {user.twoFactorEnabled ? t("profile.enabled") : t("profile.disabled")}
                </span>
              </div>
              <Separator />
              <Button variant="outline" className="w-full" size="sm" onClick={() => setPasswordOpen(true)}>
                <Shield className="me-2 h-4 w-4" />
                {t("profile.changePassword")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("profile.changePassword")}</DialogTitle>
            <DialogDescription>{t("profile.changePasswordDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("profile.currentPassword")}</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("profile.newPassword")}</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("profile.confirmNewPassword")}</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </div>
            {passwordError && (
              <p className="text-sm font-medium text-destructive">{passwordError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPasswordOpen(false); setPasswordError(null); }}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleChangePassword}
              disabled={isChanging || !passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword}
            >
              {isChanging ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <KeyRound className="me-2 h-4 w-4" />}
              {t("profile.updatePassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
