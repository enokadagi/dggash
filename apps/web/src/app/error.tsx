"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocalization } from "@/hooks/use-localization";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocalization();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-7 w-7 text-destructive" />
      </div>
      <h2 className="text-2xl font-bold">{t("errors.somethingWentWrong")}</h2>
      <p className="max-w-md text-sm text-muted-foreground">{t("errors.description")}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} variant="outline">
          <RefreshCw className="me-2 h-4 w-4" />
          {t("sharedComponents.tryAgain")}
        </Button>
        <Button onClick={() => window.location.reload()}>{t("errors.reloadPage")}</Button>
      </div>
    </div>
  );
}
