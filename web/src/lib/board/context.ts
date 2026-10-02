/** Address of attachments and the learned ticket links for the board components (set by BoardPanel, AP11.3) */
import type { Attachment, TicketLinks } from "@ruumble/protocol";
import { getContext, setContext } from "svelte";

export type FileUrl = (attachment: Attachment, download?: boolean) => string;
const KEY = Symbol("ruumble-board-files");

export const setFileUrl = (fn: FileUrl): void => void setContext(KEY, fn);
export function getFileUrl(): FileUrl {
  const fn = getContext<FileUrl | undefined>(KEY);
  if (!fn) throw new Error("getFileUrl: only available inside BoardPanel");
  return fn;
}

const TICKETS = Symbol("ruumble-board-tickets");

/** the learned ticket links of the current board, read when rendering (so they stay reactive) */
export const setTicketLinks = (fn: () => TicketLinks | undefined): void => void setContext(TICKETS, fn);
/** outside BoardPanel there are none */
export const getTicketLinks = (): (() => TicketLinks | undefined) => getContext<(() => TicketLinks | undefined) | undefined>(TICKETS) ?? (() => undefined);
