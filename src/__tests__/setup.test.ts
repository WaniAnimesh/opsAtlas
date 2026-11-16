// Feature: opsatlas-platform, setup smoke test
import * as fc from "fast-check";

describe("fast-check smoke test", () => {
  it("additive identity: n + 0 === n for any integer", () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return n + 0 === n;
      })
    );
  });
});
