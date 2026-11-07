import i18n from "@/i18n";

// Italian translations of the source link. They live here, not in
// public/locales, so they never conflict with Docmost's translation updates.
// The keys are the English text, as in the rest of the app.
const it: Record<string, string> = {
  "Source code": "Codice sorgente",
  "Based on Docmost, licensed under <license>AGPL-3.0</license>, with modifications by Informatici di Quartiere ETS":
    "Basato su Docmost, licenza <license>AGPL-3.0</license>, con modifiche di Informatici di Quartiere ETS",
};

function register() {
  i18n.addResourceBundle("it-IT", "translation", it, true, false);
}

register();
// The http backend loads Docmost's translations later: add ours again.
i18n.on("loaded", register);
