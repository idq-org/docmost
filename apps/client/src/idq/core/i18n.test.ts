import { describe, expect, it, vi } from "vitest";
import i18next, { type BackendModule } from "i18next";
import { addTranslations } from "./i18n";

// The app's instance isn't needed: each test passes its own
vi.mock("./docmost", () => ({ i18n: {} }));

// Docmost's translation files, served over http in the app
const files: Record<string, Record<string, string>> = {
  "en-US": { Pages: "Pages", Cancel: "Cancel" },
  "it-IT": { Pages: "Pagine", Cancel: "Annulla" },
};

async function setup() {
  const reads: string[] = [];
  const backend: BackendModule = {
    type: "backend",
    init() {},
    read(language, _namespace, callback) {
      reads.push(language);
      setTimeout(() => callback(null, files[language]), 5);
    },
  };
  const instance = i18next.createInstance();
  await instance.use(backend).init({
    fallbackLng: "en-US",
    load: "currentOnly",
    interpolation: { escapeValue: false },
  });
  return { instance, reads };
}

describe("addTranslations", () => {
  it("doesn't stop Docmost's translations from loading", async () => {
    const { instance, reads } = await setup();
    // Our modules are imported at startup, before the user's language is known
    addTranslations(
      "it-IT",
      { "Members map": "Mappa dei soci", Cancel: "Annulla IDQ" },
      instance,
    );
    await instance.changeLanguage("it-IT");

    expect(reads).toContain("it-IT");
    expect(instance.t("Pages")).toBe("Pagine");
    expect(instance.t("Members map")).toBe("Mappa dei soci");
    // On a key both translate, Docmost's translation is kept
    expect(instance.t("Cancel")).toBe("Annulla");
  });

  it("adds to a language that is already loaded", async () => {
    const { instance } = await setup();
    addTranslations("en-US", { "{{count}} items_one": "1 item" }, instance);
    expect(instance.t("Pages")).toBe("Pages");
    expect(instance.t("{{count}} items_one")).toBe("1 item");
  });
});
