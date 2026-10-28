/**
 * The desktop notification channel (ADR-0023): the Notification API, only on request of the user and only for loud events
 * while the window is in the background. A notice of one kind replaces the earlier one (`tag`); a nudge stays until clicked.
 */
export type DesktopPermission = "granted" | "denied" | "default" | "unsupported";

export function desktopPermission(): DesktopPermission {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/** asks the browser once; resolves to the answer, "unsupported" without the API */
export async function requestDesktopPermission(): Promise<DesktopPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showDesktop(options: { title: string; body?: string; tag: string; sticky: boolean }): void {
  if (desktopPermission() !== "granted") return;
  try {
    const n = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
      requireInteraction: options.sticky,
      icon: "/icon-192.png",
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* some browsers only allow notifications from a service worker */
  }
}
