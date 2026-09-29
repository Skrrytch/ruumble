// Minimal Mumble test client (control channel only, no audio) for feasibility tests.
// Framing: 2-byte type + 4-byte length (big endian) + protobuf payload.
const tls = require("tls");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const protobuf = require("protobufjs");

const TYPES = ["Version", "UDPTunnel", "Authenticate", "Ping", "Reject", "ServerSync", "ChannelRemove",
  "ChannelState", "UserRemove", "UserState", "BanList", "TextMessage", "PermissionDenied", "ACL",
  "QueryUsers", "CryptSetup", "ContextActionModify", "ContextAction", "UserList", "VoiceTarget",
  "PermissionQuery", "CodecVersion", "UserStats", "RequestBlob", "ServerConfig", "SuggestConfig",
  "PluginDataTransmission"];

const root = protobuf.loadSync(path.join(__dirname, "../gen/Mumble.proto"));
const T = Object.fromEntries(TYPES.map((n) => [n, root.lookupType(`MumbleProto.${n}`)]));

const CERT_DIR = path.join(__dirname, "../gen/certs");

/** Creates (once) a self-signed client certificate and returns key, certificate and SHA1 hash. */
function certFor(name) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
  const key = path.join(CERT_DIR, `${name}.key`), crt = path.join(CERT_DIR, `${name}.crt`);
  if (!fs.existsSync(crt)) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1",
      "-nodes", "-keyout", key, "-out", crt, "-days", "30", "-subj", `/CN=${name}`], { stdio: "ignore" });
  }
  const pem = fs.readFileSync(crt, "utf8");
  const sha1 = new crypto.X509Certificate(pem).fingerprint.replace(/:/g, "").toLowerCase();
  return { key: fs.readFileSync(key), cert: pem, sha1 };
}

class Bot {
  constructor(name, { host = "127.0.0.1", port = 64738 } = {}) {
    Object.assign(this, { name, host, port, session: null, channels: new Map(), pings: [] });
    this.identity = certFor(name);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.sock = tls.connect({ host: this.host, port: this.port, key: this.identity.key, cert: this.identity.cert,
        rejectUnauthorized: false }, () => {
        this.send("Version", { versionV1: (1 << 16) | (6 << 8), versionV2: 0x0001000600000000, release: "ruumble-bot", os: "Linux", osVersion: "spike" });
        this.send("Authenticate", { username: this.name, opus: true });
      });
      let buf = Buffer.alloc(0);
      this.sock.on("data", (d) => {
        buf = Buffer.concat([buf, d]);
        while (buf.length >= 6) {
          const type = buf.readUInt16BE(0), len = buf.readUInt32BE(2);
          if (buf.length < 6 + len) break;
          this.onMessage(TYPES[type], buf.subarray(6, 6 + len));
          buf = buf.subarray(6 + len);
        }
      });
      this.sock.on("error", reject);
      this.onSync = resolve;
      this.onReject = reject;
      this.pingTimer = setInterval(() => this.ping(), 5000);
    });
  }

  onMessage(type, payload) {
    if (type === "UDPTunnel" || !T[type]) return;
    const m = T[type].decode(payload);
    if (type === "ChannelState" && m.name) this.channels.set(m.name, m.channelId);
    if (type === "ServerSync") { this.session = m.session; this.onSync?.(this); }
    if (type === "Reject") this.onReject?.(new Error(`Reject: ${m.reason}`));
    if (type === "Ping" && m.timestamp) this.pings.push(Date.now() - Number(m.timestamp));
    if (type === "PermissionDenied") this.lastDenied = m;
  }

  send(type, obj) {
    const payload = T[type].encode(T[type].create(obj)).finish();
    const head = Buffer.alloc(6);
    head.writeUInt16BE(TYPES.indexOf(type), 0);
    head.writeUInt32BE(payload.length, 2);
    this.sock.write(Buffer.concat([head, payload]));
  }

  ping() { this.send("Ping", { timestamp: Date.now() }); }
  channelId(name) { return name === "Root" ? 0 : this.channels.get(name); }
  join(name) { this.send("UserState", { session: this.session, channelId: this.channelId(name) }); }
  selfMute(on) { this.send("UserState", { session: this.session, selfMute: on }); }
  selfDeaf(on) { this.send("UserState", { session: this.session, selfDeaf: on }); }
  listen(name) { this.send("UserState", { session: this.session, listeningChannelAdd: [this.channelId(name)] }); }

  close() { clearInterval(this.pingTimer); this.sock?.end(); }
}

module.exports = { Bot, certFor };
