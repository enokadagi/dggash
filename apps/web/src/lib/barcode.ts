/**
 * Barcode / QR helpers.
 *
 * - Code 128 (set B) encoder rendered as SVG for printable product labels.
 * - Payload builders for the QR code printed on the label.
 * - Generation + validation helpers used by the "Add Product" form.
 */

// Each Code 128 symbol is 6 elements (bar, space, bar, space, bar, space)
// whose widths sum to 11 modules. Index === symbol value.
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;
const QUIET_ZONE_MODULES = 10;

function isEncodable(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code > 126) return false;
  }
  return value.length > 0;
}

/** Modulo-103 weighted checksum defined by the Code 128 symbology. */
export function code128Checksum(data: string): number {
  let sum = START_B;
  for (let i = 0; i < data.length; i += 1) {
    // Position is 1-based: the first data character is weighted 1.
    sum += (i + 1) * (data.charCodeAt(i) - 32);
  }
  return sum % 103;
}

export type BarcodeSegment = { width: number; isBar: boolean };

/** Expands a Code 128 set B string into bar/space segments. */
export function encodeCode128(data: string): BarcodeSegment[] {
  if (!isEncodable(data)) {
    throw new Error("Barcode value must be printable ASCII (no accented or control characters)");
  }

  const values = [START_B];
  for (let i = 0; i < data.length; i += 1) values.push(data.charCodeAt(i) - 32);
  values.push(code128Checksum(data));
  values.push(STOP);

  const segments: BarcodeSegment[] = [];
  let isBar = true;

  for (const value of values) {
    const pattern = CODE128_PATTERNS[value];
    for (let i = 0; i < pattern.length; i += 1) {
      segments.push({ width: Number(pattern[i]), isBar });
      isBar = !isBar;
    }
  }

  return segments;
}

export interface Code128SvgOptions {
  moduleWidth?: number;
  height?: number;
  quietZoneModules?: number;
  className?: string;
  title?: string;
}

/** Renders a Code 128 barcode as a scalable SVG element string. */
export function code128ToSvg(data: string, options: Code128SvgOptions = {}): string {
  const {
    moduleWidth = 2,
    height = 60,
    quietZoneModules = QUIET_ZONE_MODULES,
    className,
    title,
  } = options;

  const segments = encodeCode128(data);
  const quiet = quietZoneModules * moduleWidth;
  const modules = segments.reduce((total, segment) => total + segment.width, 0);
  const width = modules * moduleWidth + quiet * 2;

  let x = quiet;
  const rects: string[] = [];

  for (const segment of segments) {
    const segmentWidth = segment.width * moduleWidth;
    if (segment.isBar) {
      rects.push(`<rect x="${x}" y="0" width="${segmentWidth}" height="${height}" fill="currentColor"/>`);
    }
    x += segmentWidth;
  }

  const label = title
    ? `<title>${title.replace(/[<>&]/g, "")}</title>`
    : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"`,
    ` width="100%" height="${height}" preserveAspectRatio="none"`,
    className ? ` class="${className}"` : "",
    ` role="img" aria-label="Barcode ${data.replace(/[<>&"]/g, "")}"`,
    `${label}>${rects.join("")}</svg>`,
  ].join("");
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export type BarcodeFormat = "ean13" | "upca" | "code128" | "unknown";

/** Classifies a scanned/typed value so the UI can explain what it is. */
export function detectBarcodeFormat(value: string): BarcodeFormat {
  const trimmed = value.trim();
  if (/^\d{13}$/.test(trimmed)) return "ean13";
  if (/^\d{12}$/.test(trimmed)) return "upca";
  if (/^[\x20-\x7e]+$/.test(trimmed)) return "code128";
  return "unknown";
}

/**
 * Standard modulo-10 check digit used by EAN-13 / UPC-A.
 * The right-most body digit is weighted 3, alternating towards the left.
 */
export function eanCheckDigit(digitsWithoutCheck: string): number {
  const length = digitsWithoutCheck.length;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    const weight = (length - i - 1) % 2 === 0 ? 3 : 1;
    sum += Number(digitsWithoutCheck[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{13}$/.test(trimmed)) return false;
  return eanCheckDigit(trimmed.slice(0, 12)) === Number(trimmed[12]);
}

export function isValidUpcA(value: string): boolean {
  const trimmed = value.trim();
  if (!/^\d{12}$/.test(trimmed)) return false;
  return eanCheckDigit(trimmed.slice(0, 11)) === Number(trimmed[11]);
}

/**
 * Builds a valid EAN-13 (company prefix 200-299 = restricted distribution,
 * which is the range retailers may use for in-store labelling).
 */
export function generateInternalBarcode(prefix = "200"): string {
  const body = `${prefix}${Math.floor(Math.random() * 1e9)
    .toString()
    .padStart(9, "0")}`;
  return `${body}${eanCheckDigit(body)}`;
}

/** Human friendly, collision resistant SKU suggestion. */
export function generateSku(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 10);
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug || "ITEM"}-${suffix}`;
}

// ─── QR payloads ──────────────────────────────────────────────────────────────

export interface ProductQrData {
  id?: string;
  sku: string;
  barcode?: string | null;
  name: string;
  price: number;
  currency?: string;
  url?: string;
}

export interface QrPayload {
  v: 1;
  type: "awiknet.product";
  id?: string;
  sku: string;
  barcode?: string;
  name: string;
  price: number;
  currency: string;
  url?: string;
}

/** Compact JSON payload encoded into the label's QR code. */
export function buildProductQrPayload(data: ProductQrData): QrPayload {
  return {
    v: 1,
    type: "awiknet.product",
    id: data.id,
    sku: data.sku,
    barcode: data.barcode || undefined,
    name: data.name,
    price: data.price,
    currency: data.currency || "USD",
    url: data.url,
  };
}

/** Text placed in the QR code. */
export function buildQrText(data: ProductQrData): string {
  return JSON.stringify(buildProductQrPayload(data));
}

export interface ParsedQrScan {
  /** The value that should be used for product lookup / storage. */
  value: string;
  kind: "product";
  payload: QrPayload;
}

/**
 * Normalises a scanned value.
 *
 * A scan can produce either a plain linear barcode (EAN/UPC/Code 128) or the
 * JSON payload encoded in one of our product QR labels. Plain values are
 * returned unchanged; recognised QR payloads are reduced to the identifier used
 * for lookup, so scanning a printed label resolves the same product as typing
 * its barcode.
 */
export function parseScannedValue(raw: string): ParsedQrScan | null {
  const value = raw?.trim();
  if (!value) return null;

  // Only attempt JSON parsing for values that plausibly are our own payload.
  if (value.startsWith("{")) {
    try {
      const parsed = JSON.parse(value) as Partial<QrPayload>;
      if (parsed?.type === "awiknet.product" && typeof parsed.sku === "string") {
        const identifier = parsed.barcode || parsed.id || parsed.sku;
        if (identifier) {
          return {
            value: String(identifier),
            kind: "product",
            payload: parsed as QrPayload,
          };
        }
      }
    } catch {
      // Not JSON — fall through and treat it as a raw barcode.
    }
  }

  return null;
}

/** Convenience wrapper returning only the lookup value. */
export function normalizeScannedValue(raw: string): string {
  return parseScannedValue(raw)?.value ?? raw?.trim() ?? "";
}
