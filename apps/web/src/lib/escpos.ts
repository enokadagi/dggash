/**
 * Minimal ESC/POS command encoder.
 *
 * Emits the raw byte stream for the Epson ESC/POS command set, which is the
 * de-facto standard implemented by essentially every 58mm/80mm receipt printer
 * sold in the market: Epson, Star, Bixolon, Xprinter, Gprinter, Zjiang,
 * Citizen, SNBC, Rongta, and the many OEM clones of all of them.
 *
 * Design notes:
 * - Output is a `Uint8Array` (not a string) because the barcode commands take
 *   raw byte payloads that are not valid UTF-8 text.
 * - Text is encoded once via `TextEncoder`; the codepage is assumed to be the
 *   printer's default (CP437/CP850 on most hardware), which is correct for
 *   Latin receipts. Arabic text needs an Arabic codepage, which is a
 *   printer-specific firmware feature and is not attempted here.
 */

import { create as createQr } from "qrcode";

/**
 * Module matrix (row-major, `true` = dark) for a QR payload.
 *
 * Deliberately synchronous: `qrcode`'s `create()` is synchronous, and making this
 * async would push the dot pattern onto a microtask, so a caller that builds a
 * whole receipt synchronously would read the bytes back before the QR was added.
 */
function createQrMatrix(
  text: string,
  errorCorrection: "L" | "M" | "Q" | "H",
): boolean[][] {
  // The bundled typings declare `create(text)` only, but the runtime accepts an
  // options object and it is required to select the error-correction level. The
  // function is re-typed locally to reach the real signature.
  const makeQr = createQr as unknown as (
    text: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" },
  ) => { modules: { data: ArrayLike<number>; size: number } };

  const qr = makeQr(text, { errorCorrectionLevel: errorCorrection });

  const { data, size } = qr.modules;
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = new Array<boolean>(size);
    for (let col = 0; col < size; col += 1) {
      line[col] = Boolean(data[row * size + col]);
    }
    matrix.push(line);
  }
  return matrix;
}

export const ESC = 0x1b;
export const GS = 0x1d;
export const LF = 0x0a;

/** Printer-class USB class code, used for WebUSB device filtering. */
export const USB_CLASS_PRINTER = 0x07;

export type Justify = 'left' | 'center' | 'right';
export type Underline = 'none' | 'single' | 'double';

export interface TextOptions {
  align?: Justify;
  bold?: boolean;
  underline?: Underline;
  /** 1 = normal, 2 = double width, 3 = triple width. */
  widthScale?: 1 | 2 | 3;
  /** 1 = normal, 2 = double height, 3 = triple height. */
  heightScale?: 1 | 2 | 3;
  /** Extra blank lines printed after the text. */
  feedAfter?: number;
}

export interface BarcodeOptions {
  /** GS 1 symbology identifier, e.g. 73 = Code128, 69 = Code39. */
  symbology: number;
  /** Print the human-readable text under the bars. */
  humanReadable?: boolean;
  /** Additional module width (1-4) where the symbology supports it. */
  moduleWidth?: number;
  /** Additional height (1-4) for symbologies that accept it. */
  height?: number;
}

export interface QrOptions {
  /** Correction level: L=1, M=0, Q=3, H=2. */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  /** Module size in dots. */
  moduleSize?: number;
  /** Blank modules around the code. Scanners need 4 to lock on reliably. */
  quietZone?: number;
}

const encoder = new TextEncoder();

/** Accumulates ESC/POS bytes for a single print job. */
export class EscPosBuilder {
  private chunks: Uint8Array[] = [];
  private length = 0;

  private push(...bytes: number[]): this {
    const arr = Uint8Array.from(bytes);
    this.chunks.push(arr);
    this.length += arr.length;
    return this;
  }

  private pushBytes(bytes: Uint8Array): this {
    this.chunks.push(bytes);
    this.length += bytes.length;
    return this;
  }

  /**
   * Resets the printer to its power-on state.
   * Always sent first: without it a previous job's paper feed, cut mode or
   * codepage can leak into this one.
   */
  init(): this {
    return this.push(ESC, 0x40);
  }

  /**
   * Selects the character code table. CP850 is the safest choice for receipt
   * text (Latin-1 plus common currency symbols) and is widely supported.
   */
  codepage(table = 2): this {
    return this.push(ESC, 0x74, table);
  }

  align(justify: Justify): this {
    const code = justify === 'left' ? 0 : justify === 'center' ? 1 : 2;
    return this.push(ESC, 0x61, code);
  }

  bold(enabled: boolean): this {
    return this.push(ESC, 0x45, enabled ? 1 : 0);
  }

  underline(style: Underline): this {
    const code = style === 'none' ? 0 : style === 'single' ? 1 : 2;
    return this.push(ESC, 0x2d, code);
  }

  /**
   * Character size. Uses the "size n" command (GS !) rather than separate
   * width/height commands so any valid combination is encodable.
   */
  size(widthScale = 1, heightScale = 1): this {
    const w = Math.min(Math.max(widthScale, 1), 7) - 1;
    const h = Math.min(Math.max(heightScale, 1), 7) - 1;
    return this.push(GS, 0x21, (w << 4) | h);
  }

  /** Resets bold/underline/size/alignment to defaults. */
  resetStyle(): this {
    this.bold(false);
    this.underline('none');
    this.size(1, 1);
    this.align('left');
    return this;
  }

  text(value: string, options: TextOptions = {}): this {
    const { align, bold, underline, widthScale, heightScale, feedAfter = 0 } = options;

    if (align) this.align(align);
    if (bold !== undefined) this.bold(bold);
    if (underline !== undefined) this.underline(underline);
    if (widthScale || heightScale) this.size(widthScale ?? 1, heightScale ?? 1);

    this.pushBytes(encoder.encode(value));
    this.push(LF);

    if (feedAfter > 0) this.feed(feedAfter);

    // Re-apply defaults so the next call is not affected by this one's styling.
    if (bold || underline || widthScale || heightScale) this.resetStyle();
    if (align) this.align('left');

    return this;
  }

  /**
   * Prints text padded/truncated to an exact character width.
   * `columns` should be 32 for 58mm paper and 48 for 80mm paper at font A.
   */
  textColumned(
    left: string,
    right: string,
    columns: number,
    options: TextOptions = {},
  ): this {
    // Truncate the left column when the two values cannot fit: ESC/POS has no
    // wrapping, so an over-long name would push the price onto its own line and
    // destroy the receipt's alignment instead of failing loudly.
    let label = left;
    if (label.length + right.length >= columns) {
      const room = Math.max(columns - right.length - 1, 0);
      label = room > 1 ? `${left.slice(0, room - 1)}…` : left.slice(0, room);
    }

    const gap = Math.max(columns - label.length - right.length, 1);
    return this.text(label + ' '.repeat(gap) + right, options);
  }

  /** Prints a single line of `character` (default `=`). */
  rule(character = '-', columns = 48): this {
    return this.text(character.repeat(columns));
  }

  feed(lines = 1): this {
    return this.push(ESC, 0x64, lines);
  }

  barcode(value: string, options: BarcodeOptions): this {
    const { symbology, humanReadable = true, moduleWidth, height } = options;
    const data = encoder.encode(value);

    this.push(GS, 0x68, moduleWidth ?? 3);
    this.push(GS, 0x48, height ?? 60);
    this.push(GS, 0x6b, symbology, data.length);
    this.pushBytes(data);
    // NUL terminates the barcode payload on many models.
    this.push(0x00);

    if (humanReadable) this.push(ESC, 0x61, 0x01, GS, 0x68, 0x00, 0x00);

    return this;
  }

  /**
   * Encodes a QR code as a raster image.
   *
   * The printer's native `GS ( k` QR command is deliberately not used: support
   * is patchy across OEM clones and a fair number of them print silent garbage
   * instead of erroring, which is far worse than a plain image. Drawing each
   * row as horizontal dot runs via `GS *` is understood by every ESC/POS
   * printer, so the result is predictable.
   *
   * Matrix generation is delegated to the `qrcode` package, which is already a
   * dependency for the label printing UI.
   */
  qr(text: string, options: QrOptions = {}): this {
    const matrix = createQrMatrix(text, options.errorCorrection ?? 'M');
    const dotSize = Math.max(options.moduleSize ?? 4, 1) * 8;
    const quiet = Math.max(options.quietZone ?? 4, 0);

    this.align('center');

    // Every row is emitted as alternating dark/light runs that cover the full
    // width, including the quiet zone. Printing only the dark runs looks right
    // in a hex dump but collapses the light gaps, because nothing advances the
    // print position across them, and the result cannot be scanned.
    const width = matrix.length + quiet * 2;

    for (let row = 0; row < width; row += 1) {
      const isDarkAt = (col: number): boolean => {
        const r = row - quiet;
        const c = col - quiet;
        if (r < 0 || r >= matrix.length || c < 0 || c >= matrix.length) return false;
        return matrix[r][c];
      };

      let runStart = 0;
      for (let col = 1; col <= width; col += 1) {
        if (col < width && isDarkAt(col) === isDarkAt(col - 1)) continue;
        const isDark = isDarkAt(runStart);
        const runWidth = (col - runStart) * dotSize;
        // GS * 0 xL xH yL yH d1..dk  ->  print a run of identical bytes.
        this.push(
          GS,
          0x2a,
          0x00,
          runWidth & 0xff,
          (runWidth >> 8) & 0xff,
          0x00,
          dotSize & 0xff,
          (dotSize >> 8) & 0xff,
          ...new Array<number>(dotSize).fill(isDark ? 0x30 : 0x20),
        );
        runStart = col;
      }
      this.push(LF);
    }

    this.align('left');
    return this;
  }

  /**
   * Sends the partial-cut command. Falls back to a full cut on printers that
   * reject the paper-to-sensor form; both are harmless if unsupported.
   */
  cut(partial = true): this {
    this.feed(3);
    return this.push(GS, 0x56, partial ? 0x42 : 0x41, 0x03);
  }

  /** Pulses cash drawer kick connector 2. */
  openDrawer(): this {
    return this.push(ESC, 0x70, 0x00, 0x19, 0xfa);
  }

  /** Beeps the internal buzzer (most printers only). */
  beep(): this {
    return this.push(ESC, 0x42, 0x03, 0x02);
  }

  /** Draws a horizontal rule using box-drawing characters, printer permitting. */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  toBytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

export function supportsWebUsb(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

/** Formats a number for a receipt column, e.g. `1,250.00`. */
export function formatMoney(value: number | string, decimals = 2): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Pads a product name to a column, trimming the middle when too long. */
export function fitColumn(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  if (width <= 1) return value.slice(0, width);
  return `${value.slice(0, width - 1)}…`;
}


