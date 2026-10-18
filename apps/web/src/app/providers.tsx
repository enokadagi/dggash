"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { DirectionProvider } from "@radix-ui/react-direction";
import { useLocalization } from "@/hooks/use-localization";
import "@/lib/i18n";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    return makeQueryClient();
  }
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient();
  }
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = React.useRef(getQueryClient()).current;
  const { direction, isRTL } = useLocalization();

  React.useEffect(() => {
    const dir = isRTL ? "rtl" : "ltr";
    document.documentElement.dir = dir;
  }, [isRTL]);

  return (
    <QueryClientProvider client={queryClient}>
      <DirectionProvider dir={direction}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
          <Toaster richColors position={isRTL ? "top-left" : "top-right"} closeButton />
        </ThemeProvider>
      </DirectionProvider>
    </QueryClientProvider>
  );
}
