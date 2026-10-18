"use client";

import * as React from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useLocalization } from "@/hooks/use-localization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ResetPasswordPage() {
  const { t } = useLocalization();
  const [token, setToken] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const recoveryToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    setToken(recoveryToken);
    if (recoveryToken) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, newPassword, confirmPassword });
      setComplete(true);
    } catch (err: unknown) {
      const apiError = err as { message?: string };
      setError(apiError.message ?? t("authPages.reset.invalidLink"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t("authPages.reset.title")}</CardTitle>
        <CardDescription>
          {t("authPages.reset.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {complete ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              {t("authPages.reset.success")}
            </p>
          ) : (
            <>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              {!token && (
                <p role="alert" className="text-sm text-destructive">
                  {t("authPages.reset.missingToken")}
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor="new-password">{t("profile.newPassword")}</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t("profile.confirmNewPassword")}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          {!complete && (
            <Button type="submit" className="w-full" disabled={isLoading || !token}>
              {isLoading ? t("authPages.reset.saving") : t("authPages.reset.resetPassword")}
            </Button>
          )}
          <Link className="text-sm text-primary underline-offset-4 hover:underline" href="/login/">
            {t("authPages.backToSignIn")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
