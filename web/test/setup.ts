// Unit-Tests prüfen die deutschen Texte; englische prüft test/i18n.test.ts ausdrücklich
import { setLocale } from "../src/lib/i18n/index.svelte.ts";

setLocale("de", false);
