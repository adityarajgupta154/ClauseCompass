import { describe, expect, it } from "vitest";
import { loggableUrl } from "./log-url";

describe("loggableUrl", () => {
  it("drops the query string and replaces a session id with a placeholder", () => {
    expect(loggableUrl("/api/health?x=1")).toBe("/api/health");
    expect(loggableUrl("/api/sessions")).toBe("/api/sessions");
    expect(loggableUrl("/api/sessions/policy")).toBe("/api/sessions/:id");
    expect(loggableUrl("/api/sessions/3f2b5e4a-9c1d-4e8f-a6b7-0c1d2e3f4a5b")).toBe("/api/sessions/:id");
    expect(loggableUrl("/api/sessions/3f2b5e4a-9c1d-4e8f-a6b7-0c1d2e3f4a5b/document-map?retry=1")).toBe("/api/sessions/:id/document-map");
    expect(loggableUrl(undefined)).toBeUndefined();
  });
});
