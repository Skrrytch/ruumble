/**
 * The favicon channel (ADR-0023): the tab icon with a dot while there is something unseen. The icon is drawn once with a
 * canvas from /icon.svg; if that fails the icon stays as it is.
 */
const SIZE = 64;
let dotted: string | null | undefined;
let original: { link: HTMLLinkElement; href: string; type: string; sizes: string | null }[] | null = null;

async function draw(source: string): Promise<string | null> {
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, SIZE, SIZE);
    ctx.beginPath();
    ctx.arc(SIZE - 16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#e5322d";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function setFaviconDot(on: boolean): Promise<void> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')];
  if (on) {
    dotted ??= await draw("/icon.svg");
    if (!dotted) return;
    original ??= links.map((link) => ({ link, href: link.href, type: link.type, sizes: link.getAttribute("sizes") }));
    for (const { link } of original) {
      link.href = dotted;
      link.type = "image/png";
      link.removeAttribute("sizes");
    }
  } else if (original) {
    for (const { link, href, type, sizes } of original) {
      link.href = href;
      link.type = type;
      if (sizes) link.setAttribute("sizes", sizes);
    }
    original = null;
  }
}
