/**
 * The registry files live in `data/resources/`, outside this package's
 * `rootDir`, so they are imported as untyped modules here rather than through
 * `resolveJsonModule` (which would pull them into the project as inputs). The
 * zod schema, not the compiler, is what gives them a type: every consumer
 * goes through `registry.ts`, which parses them at import.
 */
declare module "*.json" {
  const value: unknown;
  export default value;
}
