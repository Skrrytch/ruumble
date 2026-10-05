/**
 * Shows a <dialog> as a modal while its component is mounted; returns the cleanup for `$effect`.
 * `onclose` runs only when the dialog closes by itself (Escape, the browser): the close event of removing it
 * arrives a moment later and would otherwise close a dialog opened in the meantime, e.g. the status dialog opened
 * again with S right after it closed.
 */
export function showModal(dialog: HTMLDialogElement, onclose: () => void): () => void {
  dialog.addEventListener("close", onclose);
  dialog.showModal();
  return () => {
    dialog.removeEventListener("close", onclose);
    dialog.close();
  };
}
