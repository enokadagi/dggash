/**
 * WebUSB transport for ESC/POS receipt printers.
 *
 * Why WebUSB rather than a native helper: a browser cannot silently open a
 * device, so the *first* connection to a given printer always requires a user
 * gesture and a permission prompt from the browser. That is a platform
 * restriction, not something this code can bypass. What it can do â€” and does â€”
 * is make the experience a one-time "Connect printer" action per device, after
 * which the browser remembers the grant and reconnection is fully automatic,
 * including detecting a printer that was unplugged and plugged back in.
 *
 * Practical consequences worth knowing before deploying:
 * - Chrome/Edge only. Firefox and Safari do not implement WebUSB.
 * - The page must be a secure context (https, or localhost).
 * - Only USB-connected printers are reachable. Bluetooth, Ethernet/LAN and
 *   Wi-Fi printers need a print server or the browser print dialog instead.
 */

import { EscPosBuilder } from "./escpos";

/** USB vendor IDs of thermal receipt printers seen in the market. */
const KNOWN_VENDORS: Record<number, string> = {
  0x04b8: "Epson",
  0x0519: "Star Micronics",
  0x0a5f: "Zebra",
  0x05fe: "Bixolon",
  0xb97c: "Bixolon",
  0x1a99: "Xprinter",
  0x0fe6: "Xprinter / Gprinter",
  0x0483: "STMicro / Zjiang / SNBC",
  0x0416: "Winbond / SNBC / Rongta",
  0x0489: "Foxlink / Xinlian",
  0x1d0f: "Gprinter",
  0x1fc9: "NXP / Many OEM",
  0x0dd4: "Many OEM clones",
  0x1b7b: "Many OEM clones",
  0x1a6b: "Ubi / Many OEM",
  0x0482: "Many OEM clones",
  0x1c4f: "Ningbo Microware",
  0x1e0a: "Many OEM clones",
  0x2b1a: "Krowdy / Many OEM",
  0x1e3a: "Many OEM clones",
};

export interface PrinterDeviceInfo {
  /** Stable identity used to remember the selection across reloads. */
  key: string;
  vendorId: number;
  productId: number;
  vendorName: string;
  productName: string;
  /** True when the vendor ID is a recognised thermal-printer manufacturer. */
  recognised: boolean;
  serialNumber: string;
}

export type PrinterStatus = "unsupported" | "disconnected" | "ready" | "printing" | "error";

const STORAGE_KEY = "awiknet.printer";

interface SavedPrinter {
  vendorId: number;
  productId: number;
}

/** USB class 7 = printer, used to filter the chooser to likely devices. */
const PRINTER_CLASS = 0x07;

interface WebUsbNavigator extends Navigator {
  usb?: {
    requestDevice(options: { filters: unknown[] }): Promise<USBDevice>;
    getDevices(): Promise<USBDevice[]>;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
  };
}

// The WebUSB types are not in the default `lib.dom.d.ts`, so the structural
// shape actually used here is declared locally.
interface USBDevice {
  opened: boolean;
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
  serialNumber?: string;
  configuration: { interfaces: { interfaceNumber: number; alternates: { endpoints: { endpointNumber: number; direction: string }[] }[] }[] } | null;
  open(): Promise<void>;
  selectConfiguration(value: number): Promise<void>;
  claimInterface(interfaceNumber: number): Promise<void>;
  selectAlternateInterface(interfaceNumber: number, alternate: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
}

function usbApi(): WebUsbNavigator["usb"] | null {
  if (typeof navigator === "undefined") return null;
  return (navigator as WebUsbNavigator).usb ?? null;
}

export function isWebUsbSupported(): boolean {
  return usbApi() !== null;
}

/** True when the page is allowed to use WebUSB at all (requires https/localhost). */
export function isSecureUsbContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.isSecureContext === true;
}

export function describeVendor(vendorId: number): string {
  return KNOWN_VENDORS[vendorId] ?? "Unknown vendor";
}

function deviceKey(device: USBDevice): string {
  return `${device.vendorId}:${device.productId}`;
}

function toInfo(device: USBDevice): PrinterDeviceInfo {
  return {
    key: deviceKey(device),
    vendorId: device.vendorId,
    productId: device.productId,
    vendorName: device.manufacturerName || describeVendor(device.vendorId),
    productName: device.productName || "Receipt printer",
    recognised: device.vendorId in KNOWN_VENDORS,
    serialNumber: device.serialNumber || "",
  };
}

/** Locates the bulk OUT endpoint on the printer's first printer interface. */
function findOutEndpoint(device: USBDevice): { interfaceNumber: number; alternate: number; endpoint: number } | null {
  const interfaces = device.configuration?.interfaces ?? [];
  for (const usbInterface of interfaces) {
    for (const alternate of usbInterface.alternates) {
      for (const endpoint of alternate.endpoints) {
        if (endpoint.direction === "out") {
          return {
            interfaceNumber: usbInterface.interfaceNumber,
            alternate: alternate === usbInterface.alternates[0] ? 0 : 0,
            endpoint: endpoint.endpointNumber,
          };
        }
      }
    }
  }
  return null;
}

export class PrinterService {
  private device: USBDevice | null = null;
  private deviceKey: string | null = null;

  private status: PrinterStatus = "disconnected";
  private lastError: string | null = null;

  private readonly listeners = new Set<(state: PrinterState) => void>();

  private connectHandler: (() => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private deviceLock: Promise<unknown> = Promise.resolve();

  get state(): PrinterState {
    return {
      status: this.status,
      error: this.lastError,
      supported: isWebUsbSupported() && isSecureUsbContext(),
      secureContext: isSecureUsbContext(),
      device: this.device ? toInfo(this.device) : null,
      savedKey: this.readSavedKey(),
    };
  }

  subscribe(listener: (state: PrinterState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const state = this.state;
    for (const listener of this.listeners) listener(state);
  }

  private setStatus(status: PrinterStatus, error: string | null = null): void {
    this.status = status;
    this.lastError = error;
    this.emit();
  }

  // â”€â”€ Saved selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private readSavedKey(): string | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPrinter;
      if (typeof parsed?.vendorId !== "number" || typeof parsed?.productId !== "number") {
        return null;
      }
      return `${parsed.vendorId}:${parsed.productId}`;
    } catch {
      return null;
    }
  }

  private saveDevice(device: USBDevice): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ vendorId: device.vendorId, productId: device.productId }),
      );
    } catch {
      // Storage being unavailable (private mode) is not fatal.
    }
  }

  forget(): void {
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  }

  // â”€â”€ Device discovery â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Reattaches to a previously granted printer.
   *
   * This is what makes detection automatic after the first connection: the
   * browser persists the user's permission, so `getDevices()` returns the
   * printer on every page load and on every reconnect.
   */
  async restore(): Promise<boolean> {
    const usb = usbApi();
    if (!usb) return false;

    try {
      const devices = await usb.getDevices();
      const saved = this.readSavedKey();
      const match =
        (saved ? devices.find((d) => deviceKey(d) === saved) : undefined) ??
        devices.find((d) => this.looksLikePrinter(d));

      if (!match) {
        this.setStatus("disconnected");
        return false;
      }

      this.device = match;
      this.deviceKey = deviceKey(match);
      this.saveDevice(match);
      this.setStatus("ready");
      return true;
    } catch {
      this.setStatus("error", "Could not read connected printers");
      return false;
    }
  }

  /**
   * Lists devices the browser has already granted access to.
   * Does *not* prompt, so it is safe to call on mount and on an interval.
   */
  async listGranted(): Promise<PrinterDeviceInfo[]> {
    const usb = usbApi();
    if (!usb) return [];
    try {
      const devices = await usb.getDevices();
      return devices.map(toInfo);
    } catch {
      return [];
    }
  }

  /**
   * True when a device looks like a receipt printer rather than a keyboard,
   * mouse or storage device. Uses the USB class code when the interface has
   * been read, and falls back to the vendor table.
   */
  private looksLikePrinter(device: USBDevice): boolean {
    if (device.vendorId in KNOWN_VENDORS) return true;

    const interfaces = device.configuration?.interfaces ?? [];
    for (const usbInterface of interfaces) {
      // 7 = printer, 0xff = vendor specific (many thermal clones report this).
      if (usbInterface.alternates[0]?.endpoints?.length) {
        const name = (device.productName ?? "").toLowerCase();
        if (/thermal|receipt|pos|escpos|printer/.test(name)) return true;
      }
    }
    return false;
  }

  /**
   * Prompts the user to pick a printer.
   *
   * Must be called from a user gesture. The chooser is filtered to printer-class
   * devices plus a wildcard, because many budget printers misreport their class
   * as vendor-specific and would otherwise never appear in the list.
   */
  async connect(): Promise<boolean> {
    const usb = usbApi();
    if (!usb) {
      this.setStatus("unsupported", "This browser does not support USB printing");
      return false;
    }
    if (!isSecureUsbContext()) {
      this.setStatus("unsupported", "USB printing requires a secure (https) connection");
      return false;
    }

    try {
      const device = await usb.requestDevice({
        filters: [{ classCode: PRINTER_CLASS }, { classCode: 0xff }],
      });

      const endpoint = await this.prepareDevice(device);

      if (!endpoint) {
        this.setStatus("error", this.lastError || "Printer has no writable endpoint");
        return false;
      }

      this.device = device;
      this.deviceKey = deviceKey(device);
      this.saveDevice(device);
      this.setStatus("ready");
      return true;
    } catch (err) {
      // A user dismissing the chooser is a normal outcome, not an error.
      if (err instanceof DOMException && (err.name === "NotFoundError" || err.name === "AbortError")) {
        this.setStatus("disconnected");
        return false;
      }
      const msg = err instanceof Error ? err.message : "Could not connect to printer";
      // Provide clearer guidance for common issues
      if (msg.includes("Access denied") || msg.includes("access denied") || (err instanceof DOMException && err.name === "SecurityError")) {
        this.setStatus(
          "error",
          "Access denied: On Windows, the system printer driver may lock the USB device. Close other printer apps or use WinUSB, or use browser print.",
        );
        return false;
      }
      if (msg.includes("SecurityError") || msg.includes("secure")) {
        this.setStatus("error", "Secure context required. Use HTTPS or localhost.");
        return false;
      }
      this.setStatus("error", msg);
      return false;
    }
  }

  private async prepareDevice(
    device: USBDevice,
  ): Promise<{ interfaceNumber: number; alternate: number; endpoint: number } | null> {
    const op = async (): Promise<{ interfaceNumber: number; alternate: number; endpoint: number } | null> => {
      try {
        if (!device.configuration) {
          try {
            await device.selectConfiguration(1);
          } catch {
            // Already configured or cannot reconfigure
          }
        }

        const endpoint = findOutEndpoint(device);
        if (!endpoint) return null;

        if (!device.opened) {
          await device.open();
        }

        try {
          await device.claimInterface(endpoint.interfaceNumber);
          if (endpoint.alternate !== 0) {
            await device.selectAlternateInterface(endpoint.interfaceNumber, endpoint.alternate);
          }
        } catch {
          // Interface may already be claimed; proceed
        }
        return endpoint;
      } catch (err: any) {
        console.warn("WebUSB device preparation error:", err);
        let message = "Printer connection error";
        if (err?.name === "SecurityError") {
          message = "USB printer access denied. Windows printer driver or another app is holding the device.";
        } else if (err?.name === "InvalidStateError") {
          message = "Printer is busy changing state. Please retry in a moment.";
        } else if (err?.message) {
          message = err.message;
        }
        this.setStatus("error", message);
        return null;
      }
    };

    // Serialize all device open/configure calls so InvalidStateError never occurs
    this.deviceLock = this.deviceLock.then(op, op);
    return (await this.deviceLock) as { interfaceNumber: number; alternate: number; endpoint: number } | null;
  }

  disconnect(): void {
    this.device = null;
    this.deviceKey = null;
    this.setStatus("disconnected");
  }

  /** True when `key` matches the currently connected printer. */
  isCurrent(key: string | null): boolean {
    return key !== null && this.deviceKey === key;
  }

  // â”€â”€ Hot plug â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * Watches for printers being attached or removed.
   * Call once; returns a cleanup function.
   */
  watchHotplug(): () => void {
    const usb = usbApi();
    if (!usb) return () => {};

    this.connectHandler = () => {
      void this.restore();
    };
    this.disconnectHandler = () => {
      if (this.device) {
        this.device = null;
        this.deviceKey = null;
        this.setStatus("disconnected", "Printer disconnected");
      }
    };

    usb.addEventListener("connect", this.connectHandler);
    usb.addEventListener("disconnect", this.disconnectHandler);

    return () => {
      if (this.connectHandler) usb.removeEventListener("connect", this.connectHandler);
      if (this.disconnectHandler) usb.removeEventListener("disconnect", this.disconnectHandler);
      this.connectHandler = null;
      this.disconnectHandler = null;
    };
  }

  // â”€â”€ Printing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /** Sends raw ESC/POS bytes. */
  async send(bytes: Uint8Array): Promise<boolean> {
    const device = this.device;
    if (!device) {
      this.setStatus("disconnected", "No printer connected");
      return false;
    }

    try {
      const endpoint = await this.prepareDevice(device);
      if (!endpoint) {
        return false;
      }

      this.setStatus("printing");
      await device.transferOut(endpoint.endpoint, bytes.slice().buffer as ArrayBuffer);
      this.setStatus("ready");
      return true;
    } catch (err: any) {
      let message = err instanceof Error ? err.message : "Print failed. Check the printer is on and connected.";
      if (err.name === "SecurityError") {
        message = "USB printer access denied. Is another app or Windows printer driver using the device?";
      } else if (err.name === "InvalidStateError") {
        message = "Printer is busy changing state. Please try again.";
      }
      this.setStatus("error", message);
      return false;
    }
  }

  /** Builds and sends a job in one step. */
  async print(builder: EscPosBuilder | Promise<EscPosBuilder>): Promise<boolean> {
    const job = await builder;
    return this.send(job.toBytes());
  }

  /**
   * Sends a test page: proves the link works and confirms the character set.
   */
  async printTest(): Promise<boolean> {
    const job = new EscPosBuilder();
    job.init();
    job.codepage();
    job.text("AWIK NET", { align: "center", bold: true, widthScale: 2, heightScale: 2 });
    job.text("Printer test", { align: "center" });
    job.feed(1);
    job.rule("=", 42);
    job.textColumned("UTF-8 check", "OK", 42);
    job.text("!\"#$%&'()*+,-./0123456789:;<=>?@", {});
    job.text("ABCDEFGHIJKLMNOPQRSTUVWXYZ", {});
    job.text("abcdefghijklmnopqrstuvwxyz", {});
    job.textColumned("Cash", "100.00", 42);
    job.rule("=", 42);
    job.feed(1);
    job.text("Print settings look correct", { align: "center" });
    job.cut();
    return this.print(job);
  }
}

export interface PrinterState {
  status: PrinterStatus;
  error: string | null;
  supported: boolean;
  secureContext: boolean;
  device: PrinterDeviceInfo | null;
  savedKey: string | null;
}

/** Shared instance used across the app. */
export const printerService = new PrinterService();

