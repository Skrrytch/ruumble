/**
 * Text in die Zwischenablage. `navigator.clipboard` gibt es nur in sicheren Kontexten (HTTPS, localhost);
 * im Heimnetz über http://<LAN-IP> fällt die Oberfläche deshalb auf `execCommand("copy")` zurück.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // weiter mit dem Rückfall
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
