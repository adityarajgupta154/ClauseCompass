/**
 * Local dev runner: `pnpm dev` (or `npm run dev`) from the repo root.
 *
 * On Replit each service runs as its own workflow with PORT and BASE_PATH
 * injected by the platform. Outside Replit (judges, contributors) this script
 * supplies the same env and starts both services in one terminal:
 *
 *   API  http://localhost:8080/api/healthz   (override with API_PORT)
 *   Web  http://localhost:5173               (override with WEB_PORT)
 *
 * The web dev server proxies /api to the API when API_PROXY_TARGET is set,
 * which only this script does; on Replit the platform proxy handles routing.
 *
 * POSIX only (macOS, Linux, WSL): the package scripts use `export` and the
 * workspace pins Linux/macOS native binaries, so plain Windows is not supported.
 */
import { spawn, type ChildProcess } from "node:child_process";

if (process.platform === "win32") {
  console.error("pnpm dev is not supported on native Windows; use WSL.");
  process.exit(1);
}

const apiPort = process.env.API_PORT ?? "8080";
const webPort = process.env.WEB_PORT ?? "5173";

type Service = { name: string; filter: string; env: Record<string, string> };

const services: Service[] = [
  { name: "api", filter: "@workspace/api-server", env: { PORT: apiPort } },
  {
    name: "web",
    filter: "@workspace/clausecompass",
    env: {
      PORT: webPort,
      BASE_PATH: "/",
      API_PROXY_TARGET: `http://localhost:${apiPort}`,
    },
  },
];

const children: ChildProcess[] = [];
let shuttingDown = false;

// Each service runs as `pnpm -> sh -> node`; signalling only the top pnpm can
// leave the server behind, so every service gets its own process group and
// the whole group is signalled.
function stop(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    // Already gone.
  }
}

function shutdown(code: number): void {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = code;
  for (const child of children) stop(child, "SIGTERM");
  // Give the servers a moment to close their sockets before we exit.
  setTimeout(() => process.exit(code), 500).unref();
}

for (const service of services) {
  const child = spawn("pnpm", ["--filter", service.filter, "run", "dev"], {
    stdio: "inherit",
    env: { ...process.env, ...service.env },
    detached: true,
  });
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(
        `[${service.name}] exited with code ${code ?? "signal"}; stopping the other service.`,
      );
    }
    shutdown(code ?? 1);
  });
  children.push(child);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(
  `ClauseCompass dev: web http://localhost:${webPort}  api http://localhost:${apiPort}/api/healthz`,
);
