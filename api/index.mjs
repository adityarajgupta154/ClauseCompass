// The API on Vercel: one function behind the /api/(.*) rewrite in
// vercel.json. It re-exports the app that build.mjs bundles into
// artifacts/api-server/dist/vercel.mjs (see src/vercel.ts there), so Vercel
// compiles nothing of its own and the routes are the same code that listens
// on a port everywhere else. docs/deployment.md has the whole setup.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
