/** Adresse von Anhängen für die Pinnwand-Komponenten (gesetzt von BoardPanel, AP11.3) */
import type { Attachment } from "@ruumble/protocol";
import { getContext, setContext } from "svelte";

export type FileUrl = (attachment: Attachment, download?: boolean) => string;
const KEY = Symbol("ruumble-board-files");

export const setFileUrl = (fn: FileUrl): void => void setContext(KEY, fn);
export const getFileUrl = (): FileUrl => getContext<FileUrl>(KEY) ?? ((a, download) => `/api/board/files/${a.id}${download ? "?download" : ""}`);
