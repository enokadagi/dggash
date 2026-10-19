"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompanyProfile } from "@/hooks/api/use-company-settings";
import { usePrintSettings } from "@/hooks/api/use-print-settings";
import { A4Invoice, type InvoiceSale } from "./a4-invoice";
import { cn } from "@/lib/utils";

interface InvoicePrintButtonProps {
  sale: InvoiceSale;
  /** Marks the printed copy as a reprint of an existing document. */
  reprint?: boolean;
  className?: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "lg" | "icon";
  label?: string;
  /** Opens the print dialog automatically once (e.g. right after checkout). */
  autoPrint?: boolean;
  /** Called once the print document has been dismissed. */
  onPrinted?: () => void;
}

/** Waits for every <img> in the sheet to settle so the logo is not missing. */
async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            // Never hang the print dialog on a stalled image.
            window.setTimeout(resolve, 1500);
          })
    )
  );
}

/**
 * Prints a sale as an A4 invoice using the browser's own print pipeline.
 *
 * The document is mounted into a portal directly under <body> and everything
 * else is hidden with `body[data-printing="a4"]`, so the print output contains
 * only the invoice - no navigation, buttons or dashboard chrome. This works in
 * Chrome, Edge and Firefox on any A4 printer and needs neither WebUSB nor a
 * specific printer driver.
 */
export function InvoicePrintButton({
  sale,
  reprint = false,
  className,
  variant = "outline",
  size = "default",
  label = "Print A4 Invoice",
  autoPrint = false,
  onPrinted,
}: InvoicePrintButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const company = useCompanyProfile();
  const print = usePrintSettings();
  const cleanupRef = React.useRef<number | null>(null);
  const autoPrintRef = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
    return () => {
      if (cleanupRef.current !== null) {
        window.clearTimeout(cleanupRef.current);
        cleanupRef.current = null;
      }
      delete document.body.dataset.printing;
    };
  }, []);

  const finishPrint = React.useCallback(() => {
    delete document.body.dataset.printing;
    setOpen(false);
    onPrinted?.();
  }, [onPrinted]);

  const handlePrint = React.useCallback(() => {
    setOpen(true);
  }, []);

  // Auto-print once per sale (e.g. "Save and print" from the POS).
  React.useEffect(() => {
    if (!autoPrint || autoPrintRef.current) return;
    autoPrintRef.current = true;
    handlePrint();
  }, [autoPrint, handlePrint]);

  // Runs once the invoice is actually in the DOM.
  React.useEffect(() => {
    if (!open || !mounted) return;

    let cancelled = false;

    const run = async () => {
      const root = document.querySelector<HTMLElement>('[data-a4-print-root]');
      if (!root) return;

      // Two frames: one to commit layout, one for the browser to settle.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      if (cancelled) return;
      await waitForImages(root);
      if (cancelled) return;

      document.body.dataset.printing = "a4";

      const afterPrint = () => finishPrint();
      window.addEventListener("afterprint", afterPrint, { once: true });

      // Fallback for browsers that never fire afterprint reliably.
      cleanupRef.current = window.setTimeout(() => {
        window.removeEventListener("afterprint", afterPrint);
        finishPrint();
      }, 120000);

      window.print();
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [open, mounted, finishPrint]);

  return (
    <>
      <Button onClick={handlePrint} variant={variant} size={size} className={cn(className)}>
        <Printer className="me-2 h-4 w-4" />
        {label}
      </Button>

      {mounted && open
        ? createPortal(
            <div data-a4-print-root className="fixed inset-0 z-[100] overflow-auto bg-background p-4">
              <A4Invoice sale={sale} company={company.data} reprint={reprint} options={print.data?.a4} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
