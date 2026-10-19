import { describe, expect, it } from "vitest";
import { floatSide } from "../src/lib/model/float.ts";

const plan = { left: 0, right: 1000 };

describe("side of the floating board", () => {
  it("own room on the left: the board floats on the right, and the other way round", () => {
    expect(floatSide({ left: 0, right: 500 }, plan, 340, "right")).toBe("right");
    expect(floatSide({ left: 600, right: 1000 }, plan, 340, "right")).toBe("left");
    expect(floatSide({ left: 0, right: 500 }, plan, 340, "left")).toBe("right");
  });

  it("keeps its side while the room stays free there, so it does not jump", () => {
    expect(floatSide({ left: 400, right: 600 }, plan, 340, "left")).toBe("left");
    expect(floatSide({ left: 400, right: 600 }, plan, 340, "right")).toBe("right");
  });

  it("room fits on neither side: where more of it stays free", () => {
    expect(floatSide({ left: 100, right: 900 }, plan, 340, "right")).toBe("right"); // equal: stays
    expect(floatSide({ left: 50, right: 800 }, plan, 340, "left")).toBe("right");
    expect(floatSide({ left: 200, right: 950 }, plan, 340, "right")).toBe("left");
  });

  it("own room not on the shown floor: keeps its side", () => {
    expect(floatSide(null, plan, 340, "left")).toBe("left");
    expect(floatSide(null, plan, 340, "right")).toBe("right");
  });
});
