import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "./api-error";

const failure = (message: unknown) => ({ response: { data: { message } } });

describe("apiErrorMessage", () => {
  it("uses the server's message", () => {
    expect(apiErrorMessage(failure("Not allowed"), "Failed")).toBe(
      "Not allowed",
    );
  });

  it("joins validation messages", () => {
    expect(
      apiErrorMessage(failure(["a is empty", "b is long"]), "Failed"),
    ).toBe("a is empty; b is long");
  });

  it("falls back without a usable message", () => {
    expect(apiErrorMessage(new Error("network"), "Failed")).toBe("Failed");
    expect(apiErrorMessage(failure({ x: 1 }), "Failed")).toBe("Failed");
    expect(apiErrorMessage(undefined, "Failed")).toBe("Failed");
  });
});
