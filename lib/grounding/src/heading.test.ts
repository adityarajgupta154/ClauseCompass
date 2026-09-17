import { describe, expect, it } from "vitest";
import { isHeading } from "./heading";

describe("isHeading", () => {
  it("accepts short all-caps titles, numbered or not", () => {
    for (const text of [
      "BETWEEN",
      "4. LOCK-IN PERIOD AND TERMINATION",
      "IT IS AGREED AS FOLLOWS:",
      "SCHEDULE I - FITTINGS AND FIXTURES HANDED OVER",
      "  11. NOTICES  ",
      "ANNEXURE A – COMPENSATION (INR, PER ANNUM)",
    ]) {
      expect(isHeading(text), text).toBe(true);
    }
  });

  it("rejects clause text, upper-case sentences, long titles and scripts without case", () => {
    for (const text of [
      "4.2 After the lock-in period, either party may terminate",
      "NO PETS ARE ALLOWED.",
      "TENANT SHALL PAY RENT MONTHLY. LATE PAYMENT ATTRACTS INTEREST",
      "IS THE DEPOSIT REFUNDABLE?",
      "THE LICENSEE SHALL NOT SUB-LET, ASSIGN, OR PART WITH POSSESSION OF THE PREMISES OR ANY PART THEREOF",
      "किरायेदार पालतू जानवर नहीं रखेगा",
      "",
      "12,000",
    ]) {
      expect(isHeading(text), text).toBe(false);
    }
  });
});
