import i18n from "@/i18n";

// Italian translations of the IDQ MCP page. They live here, not in
// public/locales, so they never conflict with Docmost's translation updates.
// The keys are the English text, as in the rest of the app.
const it: Record<string, string> = {
  "IDQ MCP": "MCP di IDQ",
  "MCP and API keys": "MCP e chiavi API",
  "IDQ MCP server, compatible with clients of the Docmost MCP. Connect an AI assistant (Claude, ChatGPT, Cursor, VS Code…) to read and write pages with your permissions.":
    "Server MCP di IDQ, compatibile con i client dell'MCP di Docmost. Collega un assistente AI (Claude, ChatGPT, Cursor, VS Code…) per leggere e scrivere pagine con i tuoi permessi.",
  "Enable MCP": "Attiva MCP",
  "Lets members connect AI assistants to the workspace with their API keys. Assistants only see what each member can see.":
    "Permette ai membri di collegare assistenti AI al workspace con le proprie chiavi API. Gli assistenti vedono solo quello che vede ciascun membro.",
  "MCP is enabled for this workspace.": "L'MCP è attivo per questo workspace.",
  "MCP is disabled. Ask a workspace admin to enable it.":
    "L'MCP è spento. Chiedi a un amministratore del workspace di attivarlo.",
  "MCP server URL": "Indirizzo del server MCP",
  "How to connect": "Come collegarsi",
  "Claude Code": "Claude Code",
  "Claude Desktop, Cursor and other clients (via mcp-remote)":
    "Claude Desktop, Cursor e altri client (con mcp-remote)",
  "<key>": "<chiave>",
  "Replace {{placeholder}} with one of your API keys.":
    "Sostituisci {{placeholder}} con una delle tue chiavi API.",
  "API keys": "Chiavi API",
  "Personal keys to use the MCP server. Each key acts as you: an assistant that uses it can do what you can do. Revoke a key as soon as you no longer need it.":
    "Chiavi personali per usare il server MCP. Ogni chiave agisce come te: un assistente che la usa può fare quello che puoi fare tu. Revoca una chiave appena non ti serve più.",
  "Create API key": "Crea chiave API",
  Name: "Nome",
  "e.g. Claude on my laptop": "es. Claude sul mio portatile",
  Expiration: "Scadenza",
  "30 days": "30 giorni",
  "90 days": "90 giorni",
  "1 year": "1 anno",
  "No expiration": "Nessuna scadenza",
  Create: "Crea",
  Cancel: "Annulla",
  "Copy your API key": "Copia la tua chiave API",
  "This is the only time the key is shown. Copy it now and keep it somewhere safe.":
    "La chiave viene mostrata solo adesso. Copiala e conservala in un posto sicuro.",
  Copy: "Copia",
  "Copy MCP server URL": "Copia l'indirizzo del server MCP",
  "Copy command": "Copia il comando",
  "Copy API key": "Copia la chiave API",
  Copied: "Copiata",
  Done: "Fatto",
  Key: "Chiave",
  Created: "Creata",
  "Last used": "Ultimo uso",
  Expires: "Scade",
  Never: "Mai",
  Expired: "Scaduta",
  Revoke: "Revoca",
  "Revoke API key": "Revoca chiave API",
  'Revoke the key "{{name}}"? Assistants using it will stop working immediately.':
    "Revocare la chiave «{{name}}»? Gli assistenti che la usano smettono subito di funzionare.",
  "You have no API keys yet.": "Non hai ancora chiavi API.",
  "API key revoked": "Chiave API revocata",
  "Failed to create API key": "Creazione della chiave non riuscita",
  "Failed to revoke API key": "Revoca della chiave non riuscita",
  "Failed to update settings": "Aggiornamento delle impostazioni non riuscito",
  "Not an official Docmost feature: it is developed by Informatici di Quartiere.":
    "Non è una funzione ufficiale di Docmost: la sviluppa Informatici di Quartiere.",
};

function register() {
  i18n.addResourceBundle("it-IT", "translation", it, true, false);
}

register();
// The http backend loads Docmost's translations later: add ours again.
i18n.on("loaded", register);
