# MCP di IDQ

Server MCP integrato nella nostra istanza di Docmost, **compatibile con i client dell'MCP di Docmost**: stesso indirizzo, stessa autenticazione con chiave API, stessi nomi degli strumenti. Non è una funzione ufficiale Docmost: l'abbiamo scritto da zero ([issue #5](https://github.com/idq-org/docmost/issues/5)).

## Come si usa

![La pagina Impostazioni → MCP di IDQ](images/idq-mcp-settings.png)

1. Un amministratore lo attiva in *Impostazioni → MCP di IDQ → Attiva MCP*. Finché è spento, tutte le chiamate ricevono `403`.
2. Ognuno crea la propria chiave nella stessa pagina. La chiave si vede una volta sola. Può scadere dopo 30 giorni, 90 giorni o un anno, oppure non scadere mai, e si può revocare in qualsiasi momento: da quel momento smette subito di funzionare.
3. Si collega l'assistente.

   Claude Code:

   ```sh
   claude mcp add idq --transport http https://app.informaticidiquartiere.org/mcp --header "Authorization: Bearer <chiave>"
   ```

   Claude Desktop, Cursor e gli altri client che avviano un comando:

   ```sh
   npx -y mcp-remote https://app.informaticidiquartiere.org/mcp --header "Authorization: Bearer <chiave>"
   ```

Ogni chiamata agisce come l'utente che ha creato la chiave e non va mai oltre i suoi permessi di spazio e di pagina. Chi non vede uno spazio non ne trova né legge le pagine con nessuno strumento.

## Strumenti

| Area | Strumenti |
|---|---|
| Pagine | `search_pages`, `get_page`, `create_page`, `update_page`, `list_pages`, `list_child_pages`, `duplicate_page`, `copy_page_to_space`, `move_page`, `move_page_to_space` |
| Spazi | `get_space`, `list_spaces`, `create_space`, `update_space` |
| Commenti | `get_comments`, `create_comment`, `update_comment` |
| Altro | `search_attachments`, `list_workspace_members`, `get_current_user` |

Il contenuto di pagine e commenti entra ed esce in Markdown: titoli, elenchi, tabelle, blocchi di codice e diagrammi Mermaid (blocchi ` ```mermaid `). I parametri degli strumenti li descrive il server stesso: i client li leggono quando si collegano.

## Limiti e registro

- Rate limit: 120 richieste al minuto per chiave e 240 per utente. Oltre si riceve `429` con `Retry-After`.
- Ogni operazione di scrittura (riuscita o no) finisce nella tabella `idq_mcp_write_log`, con utente, chiave, strumento e argomenti. I testi lunghi vengono accorciati.
- Nella tabella delle chiavi c'è solo l'hash: la chiave in chiaro non viene salvata.
- OAuth (connettori di claude.ai, accesso «solo lettura») arriverà in una seconda fase.

## Com'è fatto

- Server: `apps/server/src/idq/`.
  - `mcp/` contiene l'endpoint `/mcp` (SDK `@modelcontextprotocol/server`, Streamable HTTP, sia per i client del protocollo 2025 sia per quelli 2026).
  - `api-keys/` gestisce le chiavi.
  - `settings/` contiene l'interruttore dell'admin.
  - `database/` contiene le migrazioni.
- Gli strumenti chiamano i controller del core (pagine, spazi, commenti, ricerca), quindi fanno esattamente gli stessi controlli di permesso dell'app web. L'unico strumento con una query nostra è `search_attachments`, che poi filtra con i permessi di pagina del core.
- Le migrazioni IDQ girano all'avvio, dopo quelle di Docmost, con una tabella di tracciamento separata (`idq_kysely_migration`). Le migrazioni che arrivano da upstream non entrano mai «in mezzo» alle nostre.
- Client: `apps/client/src/features/idq-api-keys/`. Le traduzioni italiane sono in `i18n.ts`, non in `public/locales`, per non creare conflitti con gli aggiornamenti di Docmost.
- Nel codice di Docmost cambiano tre file, con poche righe ciascuno:
  - `app.module.ts` registra il modulo;
  - `App.tsx` aggiunge la route;
  - `settings-sidebar.tsx` aggiunge la voce di menu.

## Test

Il test end-to-end ha bisogno di un'istanza avviata con un database vuoto, perché fa lui il setup del workspace:

```sh
cd apps/server
IDQ_E2E_URL=http://localhost:3000 \
IDQ_E2E_DATABASE_URL=postgresql://docmost:docmost@localhost:5432/docmost \
npx jest --config test/jest-e2e.json --runInBand idq-mcp
```

Crea un admin, un socio, uno spazio condiviso e uno spazio riservato, poi controlla:

- che il socio non trovi né legga niente dello spazio riservato, con nessuno dei 20 strumenti;
- che i contenuti Markdown (titoli, elenchi, tabelle, Mermaid) vengano scritti e riletti correttamente;
- che una chiave revocata smetta subito di funzionare.
