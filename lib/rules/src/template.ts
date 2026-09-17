/**
 * Minimal placeholder templates for review prompts: `{name}` or
 * `{name|fallback}`. A placeholder is replaced by the named value when one is
 * present and non-empty, otherwise by its fallback; a placeholder with no
 * value and no fallback is left in place so a test can catch it.
 */

const PLACEHOLDER = /\{([a-zA-Z][a-zA-Z0-9_-]*)(?:\|([^{}]*))?\}/g;

export type TemplateValues = Readonly<Record<string, string | undefined>>;

export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(PLACEHOLDER, (whole, name: string, fallback: string | undefined) => {
    const value = values[name];
    if (value !== undefined && value.trim() !== "") return value.trim();
    if (fallback !== undefined) return fallback;
    return whole;
  });
}

/** The placeholder names a template refers to, for validation. */
export function templatePlaceholders(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) names.add(match[1]!);
  return [...names];
}
