/**
 * Automated verification for the HENEX 2D USB-KBW scanner detector.
 *
 * Replays synthetic keystroke timelines through the real `WedgeDetector` with an
 * injected clock, so the results do not depend on wall-clock timing or a
 * physical scanner being attached.
 *
 * Run: npx tsx apps/web/scripts/verify-wedge-scanner.ts
 */

import {
  WedgeDetector,
  normalizeBarcodeValue,
  isPlausibleBarcodeValue,
} from "../src/lib/scanner/wedge-detector";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

/** Deterministic virtual clock + timer queue. */
function makeClock() {
  let t = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();

  return {
    now: () => t,
    setTimer(fn: () => void, ms: number) {
      const id = nextId++;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer(handle: unknown) {
      timers.delete(handle as number);
    },
    advance(ms: number) {
      const target = t + ms;
      // Fire due timers in chronological order, including ones scheduled while
      // firing (a stall timer that reschedules itself).
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Number.POSITIVE_INFINITY;
        for (const [id, timer] of timers) {
          if (timer.at <= target && timer.at < dueAt) {
            dueAt = timer.at;
            dueId = id;
          }
        }
        if (dueId === null) break;
        const timer = timers.get(dueId)!;
        timers.delete(dueId);
        t = timer.at;
        timer.fn();
      }
      t = target;
    },
    pendingTimers: () => timers.size,
  };
}

type Clock = ReturnType<typeof makeClock>;

/** Types `value` with a fixed inter-key gap, then the terminator. */
function scan(detector: WedgeDetector, clock: Clock, value: string, gapMs = 8) {
  for (const char of value) {
    detector.pushChar(char);
    clock.advance(gapMs);
  }
  return detector.endOfScan();
}

/** Types `value` the way a human does: slow, irregular gaps. */
function humanType(detector: WedgeDetector, clock: Clock, value: string, baseGapMs = 130) {
  for (const char of value) {
    detector.pushChar(char);
    // Slight irregularity so the test is not tied to one exact cadence.
    clock.advance(baseGapMs + (char.charCodeAt(0) % 37));
  }
}

function makeDetector(clock: Clock) {
  return new WedgeDetector({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
section("1. Single scan (EAN-13, USB-KBW speed, terminated by Enter)");
{
  const clock = makeClock();
  const detector = makeDetector(clock);
  const result = scan(detector, clock, "6191234567892");

  check("detects the payload", result !== null, String(result));
  check("returns the exact barcode", result?.value === "6191234567892", result?.value);
  check("reports 13 characters", result?.length === 13, String(result?.length));
  check(
    "fast run (max gap well under the 45ms threshold)",
    (result?.maxGapMs ?? 999) <= 45,
    `${result?.maxGapMs}ms`
  );
  check("resets buffer after the scan", detector.length === 0, String(detector.length));
}

section("2. Multiple consecutive scans (Code 128 alphanumeric)");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  const a = scan(detector, clock, "ABC-1234");
  const b = scan(detector, clock, "XYZ-9876");
  const c = scan(detector, clock, "AWIKNET-RTR1");

  check("scan 1 decoded", a?.value === "ABC-1234", a?.value);
  check("scan 2 decoded", b?.value === "XYZ-9876", b?.value);
  check("scan 3 decoded", c?.value === "AWIKNET-RTR1", c?.value);
}

section("3. Rapid back-to-back scans (no idle gap between reads)");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  // The operator keeps scanning: only ~12ms between the first scan's Enter and
  // the next scan's first character.
  const first = scan(detector, clock, "1111111111111");
  clock.advance(12);
  const second = scan(detector, clock, "2222222222222");

  check("first scan decoded", first?.value === "1111111111111", first?.value);
  check("second scan decoded", second?.value === "2222222222222", second?.value);
}

section("4. Duplicate scans of the same product (quantity increment)");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  const first = scan(detector, clock, "6191234567892");
  const second = scan(detector, clock, "6191234567892");

  check("first read decoded", first?.value === "6191234567892");
  check("second read decoded (allows qty +1)", second?.value === "6191234567892");
  check("both reads are identical", first?.value === second?.value);
}

section("5. Human typing must NOT trigger a lookup");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  humanType(detector, clock, "hello world", 120);
  const slow = detector.endOfScan();
  check("slow typing + Enter is ignored", slow === null, JSON.stringify(slow));

  // A brisk but human typist (~70ms/char) is still far slower than the device.
  const clock2 = makeClock();
  const detector2 = makeDetector(clock2);
  humanType(detector2, clock2, "NETHERLANDS", 70);
  const brisk = detector2.endOfScan();
  check("70ms/char typing + Enter is ignored", brisk === null, JSON.stringify(brisk));

  // Two characters, however fast, never reach the minimum scan length.
  const clock3 = makeClock();
  const detector3 = makeDetector(clock3);
  scan(detector3, clock3, "OK", 5);
  check("2-char input rejected as too short", detector3.length === 0);
}

section("6. Scan arriving while the cashier is typing customer details");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  // Human types a partial customer name into a field, no Enter yet.
  humanType(detector, clock, "Ali", 150);

  // Then the scanner fires. The slow keystrokes must have reset the buffer, so
  // the detected payload is the barcode only and never "Ali6191234567892".
  const result = scan(detector, clock, "6191234567892", 8);

  check("scan detected", result !== null, JSON.stringify(result));
  check(
    "typed text is not merged into the payload",
    result?.value === "6191234567892",
    result?.value
  );
  check("no leftover buffer", detector.length === 0);
}

section("7. Scan after manual typing that ends with Enter");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  humanType(detector, clock, "Beirut", 140);
  check("human Enter produced no scan", detector.endOfScan() === null);

  const result = scan(detector, clock, "6191234567892");
  check("next real scan still works", result?.value === "6191234567892", result?.value);
}

section("8. Scanner disconnect / stalled stream");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  // Device emits three characters then is unplugged.
  detector.pushChar("6");
  clock.advance(8);
  detector.pushChar("1");
  clock.advance(8);
  detector.pushChar("9");
  check("partial run is buffered", detector.length === 3, String(detector.length));
  check("a stall timer is armed", clock.pendingTimers() === 1, String(clock.pendingTimers()));

  // Nothing arrives: the safety-net timer fires and abandons the run.
  clock.advance(60);
  check("stall timer cleared the buffer", detector.length === 0, String(detector.length));
  check("no timers left pending", clock.pendingTimers() === 0, String(clock.pendingTimers()));

  // A later Enter from a stray keypress must not resurrect the payload.
  check("Enter after disconnect yields nothing", detector.endOfScan() === null);

  // And the detector is still healthy afterwards.
  const recovered = scan(detector, clock, "6191234567892");
  check("detector recovers after disconnect", recovered?.value === "6191234567892");
}

section("9. Terminator edge cases");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  check("Enter with empty buffer is harmless", detector.endOfScan() === null);
  check("Enter with empty buffer does not throw", detector.length === 0);

  // Some wedge devices terminate with Tab instead of Enter. The detector is
  // terminator-agnostic, so the same run decodes to the same payload.
  const tabbed = new WedgeDetector({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
  });
  for (const char of "TABTERM1") {
    tabbed.pushChar(char);
    clock.advance(8);
  }
  check(
    "Tab-terminated run decodes identically",
    tabbed.endOfScan()?.value === "TABTERM1",
    String(tabbed.length)
  );

  // Double terminator (device sends Enter twice) must not double-process.
  const detector2 = makeDetector(clock);
  scan(detector2, clock, "6191234567892");
  check("second Enter yields no duplicate", detector2.endOfScan() === null);
}

section("10. Barcode normalisation and validation");
{
  check("strips newline noise", normalizeBarcodeValue("6191234567892\r\n") === "6191234567892");
  check("strips surrounding whitespace", normalizeBarcodeValue("  6191234567892  ") === "6191234567892");
  check("strips internal tab noise", normalizeBarcodeValue("ABC\t123") === "ABC123");
  check("rejects empty", isPlausibleBarcodeValue("") === false);
  check("rejects 2 chars", isPlausibleBarcodeValue("AB") === false);
  check("rejects over-long payloads", isPlausibleBarcodeValue("X".repeat(300)) === false);
  check("accepts 256 chars", isPlausibleBarcodeValue("X".repeat(256)) === true);
  check("rejects control characters", isPlausibleBarcodeValue("ABCD") === false);

  // Runaway device: an unbounded burst must not grow the buffer forever.
  const clock = makeClock();
  const detector = makeDetector(clock);
  for (let i = 0; i < 400; i += 1) {
    detector.pushChar("9");
    clock.advance(2);
  }
  check("runaway buffer is capped", detector.length <= 256, String(detector.length));
}

section("11. Speed threshold behaves as a hard separator");
{
  // 45ms is the boundary: exactly at the limit is still accepted, one ms over
  // restarts the run. This is the property that makes the detector reliable for
  // both a HENEX device and a fast human typist.
  const atLimit = makeClock();
  const detectorLimit = makeDetector(atLimit);
  for (const char of "TESTBARC") {
    detectorLimit.pushChar(char);
    atLimit.advance(45);
  }
  check("gaps exactly at the limit are accepted", detectorLimit.length === 8, String(detectorLimit.length));

  const overLimit = makeClock();
  const detectorOver = makeDetector(overLimit);
  detectorOver.pushChar("T");
  overLimit.advance(46);
  detectorOver.pushChar("E");
  overLimit.advance(8);
  detectorOver.pushChar("S");
  check("a gap over the limit restarts the run", detectorOver.length === 2, String(detectorOver.length));
  check("restarted run is not a scan", detectorOver.endOfScan() === null);
}

section("12. Failure containment");
{
  const clock = makeClock();
  const detector = makeDetector(clock);

  // A wedged key emitting control characters must reset, not corrupt state.
  detector.pushChar("6");
  clock.advance(5);
    detector.pushChar("");
  check("control character resets the run", detector.length === 0, String(detector.length));

  const healthy = scan(detector, clock, "6191234567892");
  check("detector still usable afterwards", healthy?.value === "6191234567892");
}

// ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log(`HENEX wedge scanner checks: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailed checks:");
  failures.forEach((name) => console.log(`  - ${name}`));
  console.log("=".repeat(60));
  process.exit(1);
}
console.log("All keyboard-wedge scanner checks passed.");
console.log("=".repeat(60));
