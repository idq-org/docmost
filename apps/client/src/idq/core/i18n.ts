import { i18n } from "./docmost";

/**
 * Adds translations of an IDQ feature to Docmost's i18n. They live in our
 * files, not in public/locales, so they never conflict with Docmost's
 * translation updates. Keys are the English text, as in the rest of the
 * app; on a key Docmost translates too, Docmost's translation is kept.
 */
export function addTranslations(
  language: string,
  translations: Record<string, string>,
) {
  const register = () =>
    i18n.addResourceBundle(language, "translation", translations, true, false);
  register();
  // Docmost's translations load later, over http: add ours again then.
  i18n.on("loaded", register);
}
