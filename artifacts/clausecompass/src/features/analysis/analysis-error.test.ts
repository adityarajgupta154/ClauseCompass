import { describe, expect, it } from "vitest";
import { copy } from "@/features/journey/copy";
import { describeAnalysisError } from "./analysis-error";

const failure = (status: number, message: string | null) => ({
  name: "ApiError",
  status,
  data: message === null ? null : { error: { code: "x", message } },
});

describe("describeAnalysisError", () => {
  it("shows the API's own sentence for refusals and for a model outage", () => {
    expect(describeAnalysisError(failure(415, "This looks like a scan."))).toBe("This looks like a scan.");
    expect(describeAnalysisError(failure(503, "The rephrasing service is busy."))).toBe("The rephrasing service is busy.");
  });

  it("never shows a server crash's body, status code or stack", () => {
    expect(describeAnalysisError(failure(500, "TypeError: cannot read x at /srv/app.ts:12"))).toBe(copy.analysis.errors.generic);
    expect(describeAnalysisError(failure(502, null))).toBe(copy.analysis.errors.generic);
    expect(describeAnalysisError(failure(400, null))).toBe(copy.analysis.errors.generic);
  });

  it("tells the reader when the service could not be reached at all", () => {
    expect(describeAnalysisError(new TypeError("Failed to fetch"))).toBe(copy.analysis.errors.offline);
    expect(describeAnalysisError(new Error("boom"))).toBe(copy.analysis.errors.generic);
    expect(describeAnalysisError(undefined)).toBe(copy.analysis.errors.generic);
  });
});
