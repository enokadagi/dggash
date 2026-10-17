/**
 * Runtime self-check for the ESC/POS byte encoder.
 *
 * Run with: npx tsx scripts/verify-escpos.ts
 *
 * The byte stream is what a real printer receives, so these assertions are
 * deliberately about exact bytes rather than rendered output — a wrong byte is
 * indistinguishable from a working printer until a customer receives a garbled
 * receipt.
 */

import { EscPosBuilder, formatMoney, fitColumn, supportsWebUsb } from "../src/lib/escpos";
import { buildSaleReceipt, buildTestReceipt, receiptColumns } from "../src/lib/receipt";
import { create as createQr } from "qrcode";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function bytesOf(builder: EscPosBuilder): number[] {
  return Array.from(builder.toBytes());
}

function decode(bytes: ArrayLike<number>): string {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function contains(haystack: ArrayLike<number>, needle: number[]): boolean {
  for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    let match = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

console.log("\nESC/POS encoder\n");

// ── Command framing ───────────────────────────────────────────────────────

{
  const b = bytesOf(new EscPosBuilder().init());
  check("init emits ESC @", b.length === 2 && b[0] === 0x1b && b[1] === 0x40, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().align("center"));
  check("align center", b.length === 3 && b[0] === 0x1b && b[1] === 0x61 && b[2] === 1, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().align("right"));
  check("align right", b[2] === 2, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().bold(true));
  check("bold on", b.length === 3 && b[1] === 0x45 && b[2] === 1, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().underline("double"));
  check("underline double", b[1] === 0x2d && b[2] === 2, `got ${b}`);
}

{
  // widthScale 2, heightScale 2 → (1 << 4) | 1 = 0x11
  const b = bytesOf(new EscPosBuilder().size(2, 2));
  check("size 2x2 = 0x11", b[0] === 0x1d && b[1] === 0x21 && b[2] === 0x11, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().size(1, 1));
  check("size 1x1 = 0x00", b[2] === 0x00, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().feed(3));
  check("feed 3", b.length === 3 && b[1] === 0x64 && b[2] === 3, `got ${b}`);
}

{
  // `cut` emits a paper feed first so the cut lands below the content, then the
  // GS V command itself.
  const b = bytesOf(new EscPosBuilder().cut(false));
  check("full cut GS V A", contains(b, [0x1d, 0x56, 0x41]), `got ${b}`);
  check("partial cut GS V B", contains(bytesOf(new EscPosBuilder().cut(true)), [0x1d, 0x56, 0x42]));
}

{
  const b = bytesOf(new EscPosBuilder().openDrawer());
  check("cash drawer pulse", b[0] === 0x1b && b[1] === 0x70 && b[2] === 0x00, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().codepage(2));
  check("codepage CP850", b[1] === 0x74 && b[2] === 2, `got ${b}`);
}

// ── Text ──────────────────────────────────────────────────────────────────

{
  const b = bytesOf(new EscPosBuilder().text("Hi"));
  const expected = [0x48, 0x69, 0x0a];
  check("text bytes + LF", JSON.stringify(b) === JSON.stringify(expected), `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().text("É"));
  // TextEncoder produces UTF-8 (0xc3 0x89), which the printer maps through
  // its active codepage; the point is that it is valid multi-byte output.
  check("non-ASCII encoded as UTF-8", b.length === 3 && b[0] === 0xc3 && b[1] === 0x89, `got ${b}`);
}

{
  const b = bytesOf(new EscPosBuilder().textColumned("Total", "12.00", 20));
  // `text` always terminates the column with LF, so the printable line is
  // everything before it.
  const text = decode(b).replace(/\n$/, "");
  check("column text right-aligned", text.startsWith("Total") && text.endsWith("12.00"), `got "${text}"`);
  check("column text exact width", text.length === 20, `got ${text.length}`);
}

{
  const b = bytesOf(new EscPosBuilder().rule("=", 10));
  const text = decode(b);
  check("rule width", text.trimEnd() === "=".repeat(10), `got "${text.trimEnd()}"`);
}

{
  const text = decode(
    bytesOf(new EscPosBuilder().textColumned("A very long product name indeed", "5.00", 32)),
  ).replace(/\n$/, "");
  check("column text truncates to width", text.length === 32, `got ${text.length}`);
  check("column text keeps right value", text.endsWith("5.00"), `got "${text}"`);
  check("column text marks truncation", text.includes("…"), `got "${text}"`);
}

// ── Barcode / QR ──────────────────────────────────────────────────────────

{
  // Width/height commands precede the symbology command, so the barcode
  // sequence has to be located rather than assumed to start at offset 0.
  const b = bytesOf(new EscPosBuilder().barcode("12345", { symbology: 73 }));
  const header = [0x1d, 0x6b, 73];
  const at = b.findIndex((_, i) => header.every((v, j) => b[i + j] === v));
  check("barcode has GS k command", at >= 0, `got ${b.slice(0, 8)}`);
  check("barcode length byte", b[at + 3] === 5, `got ${b[at + 3]}`);
  check("barcode payload", decode(b.slice(at + 4, at + 9)) === "12345");
  check("barcode NUL terminator", b[at + 9] === 0x00, `got ${b[at + 9]}`);
  check("barcode sets width+height first", contains(b, [0x1d, 0x68]) && contains(b, [0x1d, 0x48]));
}

// ── Styling reset ─────────────────────────────────────────────────────────

{
  const b = bytesOf(new EscPosBuilder().text("A", { bold: true }));
  const text = decode(b);
  // Bold set, text, then bold off — so the next item is not accidentally bold.
  check("bold is reset after styled text", b.filter((x) => x === 0x45).length === 2, `got ${b}`);
  check("styled text content", text.includes("A"), `got "${text}"`);
}

// ── Helpers ───────────────────────────────────────────────────────────────

{
  check("formatMoney 2dp", formatMoney(1234.5) === "1,234.50", formatMoney(1234.5));
  check("formatMoney string input", formatMoney("99.9") === "99.90", formatMoney("99.9"));
  check("formatMoney zero", formatMoney(0) === "0.00", formatMoney(0));
  check("formatMoney invalid", formatMoney("abc") === "0.00", formatMoney("abc"));
}

{
  check("fitColumn pads", fitColumn("AB", 5) === "AB   ", fitColumn("AB", 5));
  check("fitColumn truncates", fitColumn("ABCDEFGH", 5) === "ABCD…", fitColumn("ABCDEFGH", 5));
}

{
  check("58mm = 32 cols", receiptColumns(58) === 32);
  check("80mm = 48 cols", receiptColumns(80) === 48);
}

// ── Receipt assembly ──────────────────────────────────────────────────────

{
  const sale = {
    id: "abc123",
    saleNumber: "S-20260101-0001",
    totalAmount: "30.00",
    currency: "USD",
    paymentMethod: "cash",
    status: "COMPLETED" as const,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-01T10:00:00.000Z",
    customer: null,
    user: null,
    items: [
      {
        id: "i1",
        saleId: "abc123",
        productId: "p1",
        quantity: 2,
        unitPrice: "10.00",
        totalPrice: "20.00",
        product: { id: "p1", name: "Cable", sku: "CAB-1" },
      },
      {
        id: "i2",
        saleId: "abc123",
        productId: "p2",
        quantity: 1,
        unitPrice: "10.00",
        totalPrice: "10.00",
        product: { id: "p2", name: "Mouse", sku: "MOU-1" },
      },
    ],
  };

  const job = buildSaleReceipt(sale as never, {
    paperWidth: 80,
    company: { name: "AWIK NET", tagline: "ISP", phone: "+9611", address: "Beirut" },
    cashierName: "Sam",
    includeQr: false,
  });
  const bytes = job.toBytes();
  const text = decode(bytes);

  check("receipt starts with init", bytes[0] === 0x1b && bytes[1] === 0x40);
  check("receipt contains sale number", text.includes("S-20260101-0001"), "missing sale number");
  check("receipt contains item names", text.includes("Cable") && text.includes("Mouse"));
  check("receipt contains line totals", text.includes("20.00") && text.includes("10.00"));
  check("receipt contains grand total", text.includes("30.00"));
  check("receipt contains cashier", text.includes("Sam"));
  check("receipt ends with cut", contains(bytes.slice(-6), [0x1d, 0x56, 0x42]));
  check("receipt is non-trivial in size", bytes.length > 200, `got ${bytes.length} bytes`);

  const narrow = buildSaleReceipt(sale as never, {
    paperWidth: 58,
    company: { name: "AWIK NET", tagline: "", phone: "", address: "" },
    includeQr: false,
  });
  check("58mm receipt is shorter", narrow.toBytes().length < bytes.length);
}

{
  const job = buildTestReceipt({ paperWidth: 80, company: { name: "T", tagline: "", phone: "", address: "" } });
  const text = decode(bytesOf(job));
  check("test receipt has ASCII sample", text.includes("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
  check("test receipt ends with cut", contains(bytesOf(job).slice(-6), [0x1d, 0x56, 0x42]));
}

// ── QR generation ──────────────────────────────────────────────────────────

/**
 * Rebuilds the printed dot pattern from the emitted `GS *` runs.
 *
 * The printer only ever receives run-length rectangles, so "it printed something
 * blocky" is not evidence of a valid code: a transposed matrix still renders as
 * a convincing square of dots that no scanner can read. Decoding the runs back
 * into modules and comparing them with the encoder's own output is the only
 * check that actually proves the code is correct.
 */
function decodeQrDots(bytes: number[]): { modules: boolean[][]; dotSize: number } {
  const dotSize = 8; // moduleSize 1 => one module is 8 printer dots wide
  const dots: boolean[][] = [];
  let row = 0;
  let x = 0;

  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x1d && bytes[i + 1] === 0x2a) {
      // GS * m xL xH yL yH d1..dk  ->  i+0..i+7 is the header, data starts at i+8.
      const runWidth = bytes[i + 3] | (bytes[i + 4] << 8);
      const runHeight = bytes[i + 6] | (bytes[i + 7] << 8);
      const dark = bytes[i + 8] === 0x30;
      for (let r = 0; r < runHeight; r += 1) {
        const target = row * dotSize + r;
        if (!dots[target]) dots[target] = [];
        for (let d = 0; d < runWidth; d += 1) dots[target][x + d] = dark;
      }
      x += runWidth;
      i += 7 + runHeight;
    } else if (bytes[i] === 0x0a) {
      row += 1;
      x = 0;
    }
  }

  // Only dark runs are emitted, so a row whose right-most modules are light is
  // shorter than the code is wide. The printer simply leaves the rest blank, so
  // the decoder pads to the widest row and treats the gaps as light.
  const widestRow = Math.max(...dots.map((line) => line.length));
  const moduleCols = Math.floor(widestRow / dotSize);
  const size = Math.floor(dots.length / dotSize);
  const modules: boolean[][] = [];
  for (let r = 0; r < size; r += 1) {
    const dotRow = dots[r * dotSize] ?? [];
    const line: boolean[] = [];
    for (let c = 0; c < moduleCols; c += 1) {
      line.push(Boolean(dotRow[c * dotSize]));
    }
    modules.push(line);
  }
  return { modules, dotSize };
}

function expectedQrMatrix(text: string): boolean[][] {
  const { modules } = createQr(text, { errorCorrectionLevel: "M" });
  const { data, size } = modules;
  const matrix: boolean[][] = [];
  for (let row = 0; row < size; row += 1) {
    const line: boolean[] = [];
    for (let col = 0; col < size; col += 1) line.push(Boolean(data[row * size + col]));
    matrix.push(line);
  }
  return matrix;
}

function runQrCheck(): void {
  console.log("\nQR encoding\n");
  try {
    const job = new EscPosBuilder().qr("AWIKNET-SALE-0001", { moduleSize: 3 });
    const bytes = job.toBytes();
    check("QR produces output", bytes.length > 200, `got ${bytes.length} bytes`);
    check("QR is centred before drawing", bytes[0] === 0x1b && bytes[1] === 0x61 && bytes[2] === 1);
    check("QR uses GS * dot runs", bytes.includes(0x2a), "no GS * found");
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  QR generation threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const payload = "AWIKNET-SALE-0001";
    const expected = expectedQrMatrix(payload);

    // quietZone 0 gives a grid that is directly comparable to the raw matrix.
    const bare = decodeQrDots(
      Array.from(new EscPosBuilder().qr(payload, { moduleSize: 1, quietZone: 0 }).toBytes()),
    );

    check(
      "printed QR has the same module count as the encoded code",
      bare.modules.length === expected.length,
      `printed ${bare.modules.length}, expected ${expected.length}`,
    );
    check(
      "printed QR rows all have the same width as the code",
      bare.modules.every((line, r) => line.length === expected[r]?.length),
      `widths ${bare.modules.map((l) => l.length).join(",")}`,
    );
    check(
      "printed QR matches the encoded code module for module (not transposed)",
      bare.modules.every((line, r) => line.every((cell, c) => cell === expected[r][c])),
      "dot grid does not match the QR modules - the code would not scan",
    );
    check(
      "the three finder patterns sit in the corners",
      [
        [0, 0],
        [0, expected.length - 7],
        [expected.length - 7, 0],
      ].every(([r, c]) => bare.modules[r]?.[c] === true),
    );

    const zoned = decodeQrDots(
      Array.from(new EscPosBuilder().qr(payload, { moduleSize: 1 }).toBytes()),
    );
    check(
      "a quiet zone is printed around the code by default",
      zoned.modules.length === expected.length + 8,
      `printed ${zoned.modules.length}, expected ${expected.length + 8}`,
    );
    const borderIsClear =
      zoned.modules.length === expected.length + 8 &&
      zoned.modules.every((line, r) =>
        line.every((cell, c) => {
          const edge = r < 4 || r >= zoned.modules.length - 4 || c < 4 || c >= line.length - 4;
          return edge ? cell === false : cell === expected[r - 4][c - 4];
        }),
      );
    check("the quiet zone is blank and the code inside it is unchanged", borderIsClear);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL  QR round-trip threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function main(): void {
  console.log(`\nWebUSB available in this runtime: ${supportsWebUsb()}`);
  console.log(`  (expected false under Node - this only runs in a browser)\n`);

  runQrCheck();

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
