// Sets the colour theme before the first paint, so a dark screen never flashes white (no inline script: the CSP
// forbids it). Same rule as lib/theme.svelte.ts: the choice remembered in this browser, otherwise the system setting.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("ruumble.theme");
  } catch (e) {
    // private mode or similar
  }
  if (theme !== "light" && theme !== "dark") theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
})();
