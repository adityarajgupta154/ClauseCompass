import type { AddressInfo } from "node:net";

/**
 * The API on a free port in a process of its own, for `bootApiProcess`:
 * started by tsx with the environment already set, it prints the port it
 * took and stops on SIGTERM. Nothing else goes to stdout.
 */
const { default: app } = await import("../../artifacts/api-server/src/app");
const server = app.listen(0, "127.0.0.1", () => {
  process.stdout.write(`LISTENING ${(server.address() as AddressInfo).port}\n`);
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2_000).unref();
});
