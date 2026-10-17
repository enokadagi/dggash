"use client";

import * as React from "react";
import {
  WedgeDetector,
  normalizeBarcodeValue,
  type WedgeDetectorOptions,
} from "@/lib/scanner/wedge-detector";

export type WedgeScannerStatus = "idle" | "listening" | "capturing";

export interface UseWedgeScannerOptions {
  /** Called once per completed scan with the normalised payload. */
  onScan: (value: string) => void;
  /** Turn the detector on/off without unmounting (e.g. while a modal is open). */
  enabled?: boolean;
  /** Overrides for detector tuning; the defaults target a USB-KBW device. */
  detector?: WedgeDetectorOptions;
  /**
   * When true, a scan is only consumed while focus is inside `targetRef`.
   * Defaults to false: the device is expected to work anywhere on the page.
   */
  requireFocus?: boolean;
  targetRef?: React.RefObject<HTMLElement | null>;
}

export interface WedgeScannerState {
  status: WedgeScannerStatus;
  /** Most recent accepted payload, for transient UI feedback. */
  lastScanned: string | null;
  /** Increments on every accepted scan - handy as an effect dependency. */
  scanCount: number;
}

const TERMINATORS = new Set(["Enter", "NumpadEnter", "Tab"]);

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element || typeof element.tagName !== "string") return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type?.toLowerCase();
    // Buttons, checkboxes and the like never hold typed scan data.
    return !["button", "submit", "reset", "checkbox", "radio", "file", "range", "color"].includes(
      type ?? ""
    );
  }
  return false;
}

/**
 * Clears an input/textarea that the scanner just typed into, without fighting
 * React's synthetic event system. Uses the native value setter plus an `input`
 * event so controlled components re-render correctly.
 */
function clearFieldValue(element: HTMLElement): void {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  try {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(element, "");
    else element.value = "";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {
    element.value = "";
  }
}

/**
 * Global USB keyboard-wedge scanner listener.
 *
 * Listens for the fast character burst produced by a HENEX 2D scanner in
 * USB-KBW mode and reports the payload. Human typing is rejected by the speed
 * test inside `WedgeDetector`, so customer / notes / search fields keep working
 * normally - including while a scan happens to land in them.
 *
 * Failures are contained: a thrown callback can never leave the global listener
 * in a broken state or bubble into the page.
 */
export function useWedgeScanner({
  onScan,
  enabled = true,
  detector: detectorOptions,
  requireFocus = false,
  targetRef,
}: UseWedgeScannerOptions): WedgeScannerState {
  const [status, setStatus] = React.useState<WedgeScannerStatus>("idle");
  const [lastScanned, setLastScanned] = React.useState<string | null>(null);
  const [scanCount, setScanCount] = React.useState(0);

  const onScanRef = React.useRef(onScan);
  onScanRef.current = onScan;

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      setStatus("idle");
      return;
    }

    const detector = new WedgeDetector(detectorOptions);

    const handleKeyDown = (event: KeyboardEvent) => {
      try {
        // Ignore anything the user is doing with a modifier (copy, paste,
        // reload, devtools, ...).
        if (event.ctrlKey || event.metaKey || event.altKey) return;

        const target = event.target as HTMLElement | null;

        if (requireFocus && targetRef?.current && !targetRef.current.contains(target)) {
          return;
        }

        if (TERMINATORS.has(event.key)) {
          const detection = detector.endOfScan();

          // Nothing buffered, or the run was too slow to be a scanner: let the
          // browser handle the key normally (form submit, focus move, ...).
          if (!detection) return;

          const value = normalizeBarcodeValue(detection.value);
          if (!value) return;

          // Consume it before the browser acts on the terminator.
          event.preventDefault();
          event.stopPropagation();

          // The scanner's characters were already typed into whatever field had
          // focus. Remove them so the barcode does not pollute the field.
          if (isEditableTarget(target) && target !== document.body) {
            clearFieldValue(target as HTMLElement);
          }

          setStatus("listening");
          setLastScanned(value);
          setScanCount((count) => count + 1);

          try {
            onScanRef.current(value);
          } catch (error) {
            // A failing consumer must not break subsequent scans.
            console.error("[scanner] onScan handler failed", error);
          }
          return;
        }

        if (event.key.length === 1) {
          detector.pushChar(event.key);
          if (detector.looksLikeScan()) setStatus("capturing");
        }
      } catch (error) {
        // Never let the listener throw into the page.
        console.error("[scanner] wedge handler failed", error);
        detector.reset();
      }
    };

    const handleBlur = () => setStatus("listening");

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("blur", handleBlur);
    setStatus("listening");

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("blur", handleBlur);
      detector.reset();
    };
  }, [enabled, detectorOptions, requireFocus, targetRef]);

  return { status, lastScanned, scanCount };
}
