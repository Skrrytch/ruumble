import "@fontsource-variable/inter";
import "../../docs/design/tokens.css";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { FIXTURES, MockAdapter, type FixtureName } from "./lib/adapter/mock.ts";
import { RuumbleState } from "./lib/state.svelte.ts";

// Bis zum LiveAdapter (AP7) läuft die Oberfläche gegen den Mock: ?fixture=<name>, ?debug, ?talking=0
const params = new URLSearchParams(location.search);
const requested = params.get("fixture") ?? "musterhaus";
const fixture = (requested in FIXTURES ? requested : "musterhaus") as FixtureName;
const adapter = new MockAdapter(fixture, { talking: params.get("talking") !== "0" });
const app = new RuumbleState(adapter);
app.start();

mount(App, { target: document.getElementById("app")!, props: { app, mock: params.has("debug") ? adapter : null } });
