import pino from "pino";
import { getConfig } from "./config";

const { nodeEnv, logLevel } = getConfig();

export const logger = pino({
  level: logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(nodeEnv === "production"
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
