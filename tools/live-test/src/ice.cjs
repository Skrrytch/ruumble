// Ice connection to the Mumble server. The secret is sent as the implicit context.
const { Ice } = require("ice");
const { MumbleServer } = require("../gen/MumbleServer.js");

async function connect({ host = "127.0.0.1", port = 6502, secret, serverId } = {}) {
  const init = new Ice.InitializationData();
  init.properties = Ice.createProperties();
  init.properties.setProperty("Ice.ImplicitContext", "Shared");
  init.properties.setProperty("Ice.Default.EncodingVersion", "1.0");
  const communicator = Ice.initialize(init);
  if (secret) communicator.getImplicitContext().put("secret", secret);
  const meta = await MumbleServer.MetaPrx.checkedCast(communicator.stringToProxy(`Meta:tcp -h ${host} -p ${port}`));
  let server;
  if (serverId === undefined) {
    const booted = await meta.getBootedServers();
    // The proxy carries the endpoint as seen by the server (container IP). Hence take over the identity
    // and connect ourselves with our host/port.
    const id = booted[0].ice_getIdentity().name;
    server = MumbleServer.ServerPrx.uncheckedCast(communicator.stringToProxy(`s/${id}:tcp -h ${host} -p ${port}`));
  } else {
    server = MumbleServer.ServerPrx.uncheckedCast(communicator.stringToProxy(`s/${serverId}:tcp -h ${host} -p ${port}`));
  }
  return { communicator, meta, server, MumbleServer, Ice };
}

module.exports = { connect };
