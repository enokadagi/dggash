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

export default function ForgotPasswordPage() {
  const { t } = useLocalization();
  const [email, setEmail] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      setError(t("authPages.forgot.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold">{t("authPages.forgot.title")}</CardTitle>
        <CardDescription>
          {t("authPages.forgot.description")}
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {submitted ? (
            <p role="status" className="rounded-md bg-muted p-3 text-sm">
              {t("authPages.forgot.submitted")}
            </p>
          ) : (
            <>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <div className="space-y-2">
                <Label htmlFor="recovery-email">{t("auth.email")}</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          {!submitted && (
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? t("authPages.forgot.sending") : t("authPages.forgot.sendInstructions")}
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
