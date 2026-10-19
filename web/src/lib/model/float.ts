/**
 * Side of the floating board: it floats over the floor plan, on the side where it leaves the own room fully visible.
 * Measured in the browser (the rooms' sizes come from the layout); this is the pure decision.
 */
export type BoardSide = "left" | "right";

/** horizontal extent in px, e.g. from getBoundingClientRect() */
export interface Span {
  left: number;
  right: number;
}

/**
 * `room`: the own room on the shown floor, `null` when it is not on it (other floor, corridor, entrance).
 * Keeps the current side while it still leaves the room free, so the board does not jump while rooms resize;
 * otherwise the side where the room is free, and if it fits on neither, the side with more room beside it.
 */
export function floatSide(room: Span | null, plan: Span, boardWidth: number, current: BoardSide): BoardSide {
  if (!room) return current;
  const free = { left: room.left - plan.left, right: plan.right - room.right };
  const fits = (side: BoardSide) => free[side] >= boardWidth;
  if (fits(current)) return current;
  const other: BoardSide = current === "right" ? "left" : "right";
  if (fits(other)) return other;
  if (free[other] > free[current]) return other;
  return current;
}
