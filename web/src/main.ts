import "@fontsource-variable/inter";
import "./tokens.css";
import "./app.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { LiveAdapter } from "./lib/adapter/live.ts";
import { FIXTURES, MockAdapter, type FixtureName } from "./lib/adapter/mock.ts";
import { RuumbleState } from "./lib/state.svelte.ts";

// Served by the service: LiveAdapter. Mock with ?fixture=<name> or ?mock, by default in the Vite dev server
// (there ?live for the service via the proxy). Further parameters for the mock: ?debug, ?talking=0, ?paired=0
const params = new URLSearchParams(location.search);
const useMock = params.has("fixture") || params.has("mock") || (import.meta.env.DEV && !params.has("live"));
const requested = params.get("fixture") ?? "sample";
const fixture = (requested in FIXTURES ? requested : "sample") as FixtureName;
const mock = useMock ? new MockAdapter(fixture, { talking: params.get("talking") !== "0", paired: params.get("paired") !== "0" }) : null;
const app = new RuumbleState(mock ?? new LiveAdapter());
app.start();

mount(App, { target: document.getElementById("app")!, props: { app, mock: mock && params.has("debug") ? mock : null } });
