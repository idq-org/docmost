import { describe, expect, it } from "vitest";
import { buildLicenseUrl, buildSourceUrl } from "./build-source-url";

const BRANCH_URL = "https://github.com/idq-org/docmost/tree/idq";
const FULL_SHA = "62519940a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("buildSourceUrl", () => {
  it("links to the exact commit for a full SHA", () => {
    expect(buildSourceUrl(FULL_SHA)).toBe(
      `https://github.com/idq-org/docmost/tree/${FULL_SHA}`,
    );
  });

  it("accepts a short SHA of 7 characters", () => {
    expect(buildSourceUrl("6251994")).toBe(
      "https://github.com/idq-org/docmost/tree/6251994",
    );
  });

  it("accepts uppercase hex digits", () => {
    expect(buildSourceUrl("ABCDEF1")).toBe(
      "https://github.com/idq-org/docmost/tree/ABCDEF1",
    );
  });

  it.each([
    ["an empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["surrounding spaces", ` ${FULL_SHA} `],
    ["non-hex characters", "62519940zzzz"],
    ["fewer than 7 characters", "625199"],
    ["more than 40 characters", `${FULL_SHA}0`],
    ["a path traversal attempt", "../../evil"],
    ["a query string", "6251994?x=1"],
  ])("falls back to the idq branch for %s", (_label, value) => {
    expect(buildSourceUrl(value)).toBe(BRANCH_URL);
  });
});

describe("buildLicenseUrl", () => {
  it("links to LICENSE at the exact commit", () => {
    expect(buildLicenseUrl(FULL_SHA)).toBe(
      `https://github.com/idq-org/docmost/blob/${FULL_SHA}/LICENSE`,
    );
  });

  it.each([
    ["undefined", undefined],
    ["an empty string", ""],
    ["a non-hex value", "../../evil"],
  ])("falls back to LICENSE on the idq branch for %s", (_label, value) => {
    expect(buildLicenseUrl(value)).toBe(
      "https://github.com/idq-org/docmost/blob/idq/LICENSE",
    );
  });
});
