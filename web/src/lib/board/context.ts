/** Address of attachments for the board components (set by BoardPanel, AP11.3) */
import type { Attachment } from "@ruumble/protocol";
import { getContext, setContext } from "svelte";

export type FileUrl = (attachment: Attachment, download?: boolean) => string;
const KEY = Symbol("ruumble-board-files");

export const setFileUrl = (fn: FileUrl): void => void setContext(KEY, fn);
export function getFileUrl(): FileUrl {
  const fn = getContext<FileUrl | undefined>(KEY);
  if (!fn) throw new Error("getFileUrl: nur innerhalb von BoardPanel verfügbar");
  return fn;
}
