/**
 * Runtime self-check for the receipt template.
 *
 * Run with: npx tsx scripts/verify-receipt.ts [path/to/sale.json]
 *
 * `escpos.ts` proves the bytes are right; this proves the *layout* built from a
 * real API payload is right. The fixture mirrors the actual API response (Decimal
 * fields arrive as strings, `customer` is null for a walk-in) because the failure
 * mode that matters is a receipt that silently renders "NaN", a blank customer
 * line, or a header that wraps, rather than one that throws.
 */

import { buildSaleReceipt, buildTestReceipt, receiptColumns } from "../src/lib/receipt";
import type { Sale } from "../src/hooks/api/use-sales";
import { readFileSync } from "node:fs";

let failures = 0;

function check(name: string, condition: boolean, detail = ""): void {
  if (condition) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

/**
 * Returns the human-visible text of a job.
 *
 * The byte stream interleaves command sequences (`ESC @`, `ESC t n`, `GS ! n`,
 * `GS V m n`, ...) with the printed characters, and those commands put no ink on
 * a character cell. Measuring the raw stream directly would count control data
 * as content, so each prefix plus its command byte and optional single parameter
 * is removed first.
 *
 * Callers must build with `includeQr: false`: the QR payload is raw dot data, not
 * text, and has no printable width.
 */
function visibleText(builder: { toBytes(): Uint8Array }): string {
  const text = new TextDecoder().decode(builder.toBytes());
  return text
    .replace(/[\x1b\x1d][\x20-\x7e](?:[\x00-\x1a\x1c\x1e-\x7f])?/g, "")
    .replace(/[\x00-\x09\x0b-\x1f]/g, "");
}

function maxLineWidth(text: string): number {
  return Math.max(...text.split(/\r?\n/).map((line) => line.length));
}

const company = {
  name: "AWIK NET",
  tagline: "Computer & Network Solutions",
  phone: "+961 1 234 567",
  address: "Beirut, Lebanon",
};

const walkInSale = {
  id: "1093f4f0-7077-41d4-9863-5806cba5bcb8",
  saleNumber: "S-20261001-195812",
  customerId: null,
  userId: "c3a47bef-af2c-4830-b8bc-b571db314138",
  totalAmount: "27",
  currency: "USD",
  paymentMethod: "cash",
  status: "REFUNDED",
  notes: null,
  createdAt: "2026-10-01T16:51:51.302Z",
  updatedAt: "2026-10-01T16:51:51.379Z",
  customer: null,
  user: { id: "c3a47bef-af2c-4830-b8bc-b571db314138", firstName: "System", lastName: "Administrator" },
  items: [
    {
      id: "c0991a7f-e402-404f-816a-0b63fef24285",
      saleId: "1093f4f0-7077-41d4-9863-5806cba5bcb8",
      productId: "8309c3de-299c-45c1-808f-202f0cda5ec2",
      quantity: 3,
      unitPrice: "9",
      totalPrice: "27",
      product: {
        id: "8309c3de-299c-45c1-808f-202f0cda5ec2",
        name: "E2E Widget",
        sku: "E2E-WIDGET-1790884310",
        barcode: null,
      },
    },
  ],
} as unknown as Sale;

const namedCustomerSale = {
  ...walkInSale,
  status: "COMPLETED",
  customerId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  customer: { firstName: "Ali", lastName: "Haddad" },
  totalAmount: "450",
  paymentMethod: "card",
  items: [
    {
      ...walkInSale.items[0],
      quantity: 1,
      unitPrice: "150",
      totalPrice: "150",
      product: { name: "MikroTik hAP ac2", sku: "MIK-HAPAC2", barcode: "2000000013377" },
    },
    {
      ...walkInSale.items[0],
      id: "second-item",
      quantity: 2,
      unitPrice: "150",
      totalPrice: "300",
      product: { name: "Poe switch", sku: "POE-8P", barcode: null },
    },
  ],
} as unknown as Sale;

const longNameSale = {
  ...namedCustomerSale,
  totalAmount: "150",
  items: [
    {
      ...walkInSale.items[0],
      quantity: 1,
      unitPrice: "150",
      totalPrice: "150",
      product: {
        name: "Ubiquiti UniFi U7 Pro Maximum Range Indoor Access Point",
        sku: "UNI-U7PRO-MR",
        barcode: null,
      },
    },
  ],
} as unknown as Sale;

console.log("Receipt layout");

for (const width of [58, 80] as const) {
  const cols = receiptColumns(width);
  const text = visibleText(
    buildSaleReceipt(walkInSale, { paperWidth: width, company, includeQr: false }),
  );

  check(`${width}mm: no NaN or undefined leaked into the output`, !/NaN|undefined/.test(text));
  check(`${width}mm: shows the sale number`, text.includes("S-20261001-195812"));
  check(`${width}mm: shows the company name`, text.includes("AWIK NET"));
  check(`${width}mm: shows the tagline`, text.includes("Computer & Network Solutions"));
  check(`${width}mm: shows the product name`, text.includes("E2E Widget"));
  check(`${width}mm: shows the quantity and unit price`, text.includes("3 x 9.00"));
  check(`${width}mm: shows the total as a fixed-decimal amount`, text.includes("27.00"));
  check(`${width}mm: shows the sale status`, text.includes("REFUNDED"));
  check(`${width}mm: labels the payment method in plain English`, text.includes("Cash"));
  check(`${width}mm: omits the customer line for a walk-in sale`, !text.includes("Customer"));
  check(`${width}mm: closes with the footer`, text.includes("Thank you for your business"));
  check(
    `${width}mm: every printed line fits within ${cols} characters`,
    maxLineWidth(text) <= cols,
    `widest line was ${maxLineWidth(text)}`,
  );

  // A double-width header is the widest thing on the paper; a name that is too
  // long for half the printable width would silently wrap onto a second line.
  const longCompany = { ...company, name: "AWIK NET Computer and Network Solutions Lebanon" };
  const headerText = visibleText(
    buildSaleReceipt(walkInSale, { paperWidth: width, company: longCompany, includeQr: false }),
  );
  check(
    `${width}mm: an over-long company name does not overflow the paper`,
    maxLineWidth(headerText) <= cols,
    `widest line was ${maxLineWidth(headerText)}`,
  );

  const longItemText = visibleText(
    buildSaleReceipt(longNameSale, { paperWidth: width, company, includeQr: false }),
  );
  check(
    `${width}mm: an over-long product name is truncated, not wrapped`,
    maxLineWidth(longItemText) <= cols,
    `widest line was ${maxLineWidth(longItemText)}`,
  );
  check(
    `${width}mm: price column stays aligned after truncation`,
    longItemText.includes("150.00"),
  );
}

{
  const text = visibleText(
    buildSaleReceipt(namedCustomerSale, { paperWidth: 80, company, includeQr: false }),
  );
  check("named customer is printed", text.includes("Ali Haddad"));
  check("subtotal is summed from the line items", text.includes("450.00"));
  check("bank transfer label is absent for a card sale", !text.includes("Bank transfer"));
  check("card payment label is present", text.includes("Card"));
}

{
  const text = visibleText(
    buildSaleReceipt(namedCustomerSale, {
      paperWidth: 80,
      company,
      cashierName: "System Administrator",
      includeQr: false,
    }),
  );
  check("cashier name is printed when supplied", text.includes("System Administrator"));
}

{
  const bytes = Array.from(buildSaleReceipt(walkInSale, { paperWidth: 80, company }).toBytes());
  check("emits the paper-cut sequence (GS V B 3)", bytes.slice(-4).join(",") === "29,86,66,3");
  check("emits the ESC @ initialise sequence at the start", bytes.slice(0, 2).join(",") === "27,64");
  const withQr = buildSaleReceipt(walkInSale, { paperWidth: 80, company, includeQr: true }).toBytes();
  const withoutQr = buildSaleReceipt(walkInSale, { paperWidth: 80, company, includeQr: false }).toBytes();
  check("the QR block is only emitted when requested", withQr.length > withoutQr.length);
  check("the QR block is substantial, not a stub", withQr.length - withoutQr.length > 200);
}

{
  const text = visibleText(buildTestReceipt({ paperWidth: 58, company }));
  check("test page prints its heading", text.includes("Printer test"));
  check("test page reports the character count", text.includes("32 per line"));
  check("test page prints the character ramp", text.includes("0123456789 $ 12.34"));
  check(
    "test page is presentable even with a blank company",
    visibleText(
      buildTestReceipt({ paperWidth: 58, company: { name: "", tagline: "", phone: "", address: "" } }),
    ).includes("Printer test"),
  );
  const longCompany = { ...company, name: "AWIK NET Computer and Network Solutions Lebanon" };
  check(
    "test page header does not overflow with a long company name",
    maxLineWidth(visibleText(buildTestReceipt({ paperWidth: 80, company: longCompany }))) <= 48,
  );
}

const realSalePath = process.argv[2];
if (realSalePath) {
  try {
    const real = JSON.parse(readFileSync(realSalePath, "utf8").replace(/^\uFEFF/, "")) as Sale;
    const plain = buildSaleReceipt(real, { paperWidth: 80, company, includeQr: false });
    const text = visibleText(plain);
    check(`live sale payload renders (${real.saleNumber})`, plain.toBytes().length > 200);
    check("live sale payload has no NaN or undefined", !/NaN|undefined/.test(text));
    check("live sale payload prints its own number", text.includes(real.saleNumber));
    check("live sale payload stays within the paper width", maxLineWidth(text) <= 48, `widest line was ${maxLineWidth(text)}`);
  } catch (error) {
    check(`live sale payload from ${realSalePath}`, false, (error as Error).message);
  }
}

console.log(failures === 0 ? "\nAll receipt checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
