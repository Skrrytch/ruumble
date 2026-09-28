/** Bilder der Pinnwand: Typ an den ersten Bytes erkennen, Maße aus dem Dateikopf lesen (ohne Bibliothek). */
import { detectImage } from "../avatars.ts";

export { detectImage };

/** Breite und Höhe für PNG, GIF, JPEG und WEBP; `null`, wenn nicht lesbar */
export function imageSize(b: Uint8Array, mime: string): { width: number; height: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (mime === "image/png") return { width: dv.getUint32(16), height: dv.getUint32(20) };
    if (mime === "image/gif") return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
    if (mime === "image/webp") {
      const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
      if (chunk === "VP8 ") return { width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff };
      if (chunk === "VP8L") {
        const bits = dv.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8X") return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
      return null;
    }
    if (mime === "image/jpeg") {
      for (let i = 2; i + 9 < b.length; ) {
        if (b[i] !== 0xff) return null;
        const marker = b[i + 1]!;
        const len = dv.getUint16(i + 2);
        // SOF0–SOF15 außer DHT (C4), JPG (C8), DAC (CC)
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { width: dv.getUint16(i + 7), height: dv.getUint16(i + 5) };
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Dateiname für Speicher und Download bereinigen (keine Pfade, keine Steuerzeichen) */
export function safeFileName(raw: string | undefined): string {
  let name = "";
  try {
    name = decodeURIComponent(raw ?? "");
  } catch {
    name = raw ?? "";
  }
  name = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 255);
  return name || "datei";
}
