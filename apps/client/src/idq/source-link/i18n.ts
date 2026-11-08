import { addTranslations } from "@/idq/core/i18n";

// Italian translations of the source link (see addTranslations).
const it: Record<string, string> = {
  "Source code": "Codice sorgente",
  "Based on Docmost, licensed under <license>AGPL-3.0</license>, with modifications by Informatici di Quartiere ETS":
    "Basato su Docmost, licenza <license>AGPL-3.0</license>, con modifiche di Informatici di Quartiere ETS",
};

addTranslations("it-IT", it);
