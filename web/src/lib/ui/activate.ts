/**
 * Rooms are entered with a double-click, so a stray click does not move anyone. Enter and Space never send a
 * double-click, so the focused button gets this as its keyboard counterpart.
 */
export function onActivateKey(action: () => void): (e: KeyboardEvent) => void {
  return (e) => {
    if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
    e.preventDefault(); // no click from Enter, no scrolling from Space
    action();
  };
}
