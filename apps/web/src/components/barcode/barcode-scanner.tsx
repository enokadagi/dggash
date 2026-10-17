"use client";

import * as React from "react";
import { Camera, CameraOff, Keyboard, Loader2, ScanLine, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The Barcode Detection API is not in the bundled DOM lib types yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorInstance {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorInstance;

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return typeof ctor === "function" ? ctor : null;
}

const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "qr_code",
  "data_matrix",
];

export type ScannerSupport = "camera" | "manual" | "checking";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (value: string) => void;
  title?: string;
  description?: string;
}

/**
 * Scans a barcode / QR code with the device camera, and always keeps a
 * manual field available for USB (keyboard wedge) scanners.
 */
export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  title = "Scan barcode",
  description = "Point the camera at the barcode or QR code, or type it below.",
}: BarcodeScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const manualRef = React.useRef<HTMLInputElement>(null);

  const [support, setSupport] = React.useState<ScannerSupport>("checking");
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [manualValue, setManualValue] = React.useState("");

  const stopCamera = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const submit = React.useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      stopCamera();
      onDetected(trimmed);
      onOpenChange(false);
    },
    [onDetected, onOpenChange, stopCamera]
  );

  const startCamera = React.useCallback(async () => {
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setSupport("manual");
      setCameraError("This browser does not expose a camera API.");
      return;
    }

    const Detector = getBarcodeDetector();
    if (!Detector) {
      setSupport("manual");
      setCameraError(
        "Live barcode detection is not supported in this browser. Use a USB scanner in the field below, or type the code."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const detector = new Detector({ formats: SCAN_FORMATS });
      setSupport("camera");

      timerRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes.find((code) => code.rawValue?.trim())?.rawValue;
          if (value) submit(value);
        } catch {
          // A single failed frame is not fatal, keep polling.
        }
      }, 400);
    } catch (error) {
      setSupport("manual");
      const name = (error as { name?: string })?.name;
      setCameraError(
        name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access, or use a USB scanner below."
          : "Camera unavailable. Use a USB scanner below, or type the code."
      );
    }
  }, [submit]);

  React.useEffect(() => {
    if (!open) {
      stopCamera();
      setManualValue("");
      setSupport("checking");
      setCameraError(null);
      return;
    }
    startCamera();
    // Keep the manual field focused so keyboard-wedge scanners land here.
    const focusTimer = setTimeout(() => manualRef.current?.focus(), 300);
    return () => {
      clearTimeout(focusTimer);
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-black">
            <video
              ref={videoRef}
              className={cn("h-full w-full object-cover", support !== "camera" && "hidden")}
              playsInline
              muted
            />
            {support !== "camera" && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-white/80">
                {support === "checking" ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <CameraOff className="h-6 w-6" />
                )}
                <p className="text-xs">
                  {support === "checking" ? "Starting camera…" : "Camera preview unavailable"}
                </p>
              </div>
            )}
            {support === "camera" && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-white/40" />
            )}
          </div>

          {cameraError && (
            <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{cameraError}</span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="manual-barcode" className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Keyboard className="h-3.5 w-3.5" />
              USB scanner or manual entry
            </Label>
            <div className="flex gap-2">
              <Input
                id="manual-barcode"
                ref={manualRef}
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit(manualValue);
                  }
                }}
                placeholder="Scan or type, then press Enter"
                className="font-mono"
                autoComplete="off"
              />
              <Button type="button" onClick={() => submit(manualValue)} disabled={!manualValue.trim()}>
                <ScanLine className="me-2 h-4 w-4" />
                Use
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              A USB scanner types the code and sends Enter automatically.
            </p>
          </div>
        </div>

        <DialogFooter>
          {support === "camera" && (
            <Button variant="outline" onClick={startCamera}>
              <Camera className="me-2 h-4 w-4" />
              Restart camera
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
