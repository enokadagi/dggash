/**
 * Shared instance of the WebUSB printer service plus React bindings.
 *
 * Kept in a module-level singleton (not a context provider) because exactly one
 * physical printer is attached to a given till, and a global instance means the
 * POS screen and the settings screen always agree on connection state.
 */

"use client";

import * as React from "react";
import { printerService, type PrinterState } from "@/lib/printer";

export function usePrinter(): PrinterState & {
  connect: () => Promise<boolean>;
  disconnect: () => void;
  printTest: () => Promise<boolean>;
  forget: () => void;
} {
  const [state, setState] = React.useState<PrinterState>(() => printerService.state);

  React.useEffect(() => {
    // Reattaching on mount is what makes a previously connected printer come
    // back automatically after a page reload or crash.
    const unsubscribe = printerService.subscribe(setState);
    void printerService.restore();
    const stopWatching = printerService.watchHotplug();
    return () => {
      unsubscribe();
      stopWatching();
    };
  }, []);

  return React.useMemo(
    () => ({
      ...state,
      connect: () => printerService.connect(),
      disconnect: () => printerService.disconnect(),
      printTest: () => printerService.printTest(),
      forget: () => printerService.forget(),
    }),
    [state],
  );
}

export { printerService };
