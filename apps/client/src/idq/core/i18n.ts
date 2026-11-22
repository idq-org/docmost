import type { i18n as I18n } from "i18next";
import { i18n } from "./docmost";

/**
 * Adds translations of an IDQ feature to Docmost's i18n. They live in our
 * files, not in public/locales, so they never conflict with Docmost's
 * translation updates. Keys are the English text, as in the rest of the
 * app; on a key Docmost translates too, Docmost's translation is kept.
 *
 * Ours are added only once Docmost's own translations for that language are
 * in: i18next loads a language over http only if it has no resources for it
 * yet, so adding ours first would stop Docmost's file from ever loading.
 */
export function addTranslations(
  language: string,
  translations: Record<string, string>,
  instance: I18n = i18n,
) {
  const register = () =>
    instance.addResourceBundle(
      language,
      "translation",
      translations,
      true,
      false,
    );
  // Already loaded (e.g. the fallback language, loaded at startup)
  if (instance.hasResourceBundle(language, "translation")) register();
  // Loaded later, when the user's language is set; also after a reload,
  // which replaces the bundle with Docmost's file alone.
  instance.on("loaded", (loaded: Record<string, unknown>) => {
    if (loaded[language]) register();
  });
}
