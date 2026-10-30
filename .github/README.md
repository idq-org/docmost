# Docmost — fork di Informatici di Quartiere

Fork di [docmost/docmost](https://github.com/docmost/docmost) che IDQ usa per la knowledge base dell'associazione, consultabile anche da agenti via MCP. Il README originale del progetto è [`README.md`](../README.md).

## Branch

| Branch | Contenuto | Regole |
|---|---|---|
| `idq` (predefinito) | Docmost più le nostre modifiche; è il branch da cui si fa il deploy | le modifiche entrano tramite PR |
| `main` | copia identica di `docmost/docmost@main` | non si committa mai a mano: lo aggiorna la action |

Entrambi i branch non si possono cancellare né sovrascrivere con force push.

## Aggiornamenti da Docmost

La action [`Sync upstream`](workflows/sync-upstream.yml) gira ogni notte, oppure a mano da *Actions → Sync upstream → Run workflow*:

1. porta `main` allo stato di `docmost/docmost`;
2. se `main` ha commit che `idq` non ha, apre una PR `main → idq` (una sola alla volta).

La PR si unisce con **merge commit**: squash e rebase sono disattivati nel repo, così la storia resta condivisa con l'originale e i prossimi aggiornamenti restano semplici. Dopo il merge non cancellare `main`.

Se la PR ha conflitti, si risolvono in locale:

```sh
git checkout idq && git pull
git fetch origin
git merge origin/main      # oppure una versione precisa, es. git merge v0.98.0
# risolvere i conflitti, poi:
git push
```

Se la action fallisce con un errore sui permessi `workflows`, Docmost ha modificato i suoi file in `.github/workflows` e il token della action non può copiarli. In quel caso si aggiorna `main` con il proprio account (serve il permesso `workflow` di `gh`):

```sh
gh repo sync idq-org/docmost --branch main
```

## CI e deploy

Docmost gira su https://app.informaticidiquartiere.org, sulla VPS Hostinger, in `/srv/docmost` (compose, `.env` con i segreti, backup notturni del database in `backups/`).

- [`CI`](workflows/idq-ci.yml) costruisce l'immagine Docker su ogni PR verso `idq`. Il check `docker-build` è obbligatorio per unire. Per le PR di Sync upstream la lancia Sync upstream stesso.
- [`Deploy`](workflows/idq-deploy.yml) parte a ogni push su `idq` (cioè a ogni merge) e lancia `/srv/docmost/deploy.sh` sulla VPS: porta il codice a `origin/idq` e ricostruisce i container. Si può rilanciare a mano da *Actions → Deploy → Run workflow*.

Sulla VPS non si modifica mai `/srv/docmost/src` a mano: a ogni deploy viene riportato a `origin/idq`.

## Sviluppo in locale

```sh
git clone https://github.com/idq-org/docmost.git && cd docmost
git remote add upstream https://github.com/docmost/docmost.git
git remote set-url --push upstream DISABLE   # niente push per errore verso l'originale
gh repo set-default idq-org/docmost          # le PR di gh vanno qui, non su docmost/docmost
```

Il submodule `apps/server/src/ee` punta alla versione Enterprise di Docmost, che è privata: non serve e non va inizializzato.

## Regole per le modifiche

- Modifiche piccole, e file nuovi invece di modifiche a file esistenti dove si può: meno conflitti a ogni aggiornamento. Cartelle suggerite per il nostro codice: `apps/server/src/idq/` e `apps/client/src/features/idq-*/`.
- Niente credenziali né dati dell'associazione nel repo: il fork è pubblico (licenza AGPL-3.0).
- Le PR vanno verso `idq` di questo repo, mai verso `docmost/docmost`.
- Tutto rispetta i permessi di spazio di Docmost: ogni funzionalità ha un test con un utente che non vede uno spazio riservato.
- Prima di cominciare una funzionalità, scrivi un commento sulla sua issue, così evitiamo di lavorare in due sulla stessa cosa.

## Licenze

Nel repo convivono due licenze, e vanno rispettate tutte e due.

### Codice Enterprise: non si usa

Queste cartelle sono sotto la *Docmost Enterprise License*:
- `apps/server/src/ee` (submodule privato, non inizializzato);
- `apps/client/src/ee`;
- `packages/ee`;
- `packages/base-formula`.

Quel codice si può usare in produzione solo con un abbonamento, e anche le modifiche restano di Docmost. Quindi:

- non si apre, non si copia, non si adatta e non si importa niente da quelle cartelle. Chi realizza una funzionalità simile a una delle edizioni a pagamento (kanban, chiavi API, OAuth, MCP) la scrive da zero, senza guardare quel codice;
- non si creano file in percorsi `ee/` e non si sostituiscono moduli Enterprise;
- non si toccano i controlli di licenza (`LicenseCheckService`, `hasFeature`, feature flag) né le impostazioni legate alle edizioni a pagamento (per esempio `mcpEnabled`), e non si sblocca nessuna funzione a pagamento;
- la nostra immagine si costruisce dallo stesso codice delle immagini Community ufficiali: il codice Enterprise del client c'è, ma resta spento senza licenza, come in quelle, e non va mai attivato né modificato.

### Core AGPL-3.0: si usa e si modifica, con i suoi obblighi

- Il nostro codice è sotto AGPL-3.0, come il repo.
- Si conservano i file di licenza e le note di copyright di Docmost e delle librerie.
- Appena l'app che gira sulla VPS è modificata, l'interfaccia deve offrire a chi la usa il link al codice sorgente (sezione 13 dell'AGPL): vedi l'issue [#8](https://github.com/idq-org/docmost/issues/8).

### Marchio e fonti

- «Docmost» è il marchio di Docmost, Inc. Le nostre aggiunte sono «di IDQ» e non si presentano come funzioni ufficiali Docmost. Il loro logo non si usa per le nostre funzionalità, e il nome si usa solo per descrivere (per esempio «compatibile con…»).
- Per le compatibilità si usa solo la documentazione pubblica di Docmost.
- Librerie e servizi terzi devono avere licenze compatibili (MIT, Apache-2.0…), e se ne conservano le note.

Ogni PR che aggiunge funzionalità dichiara nella descrizione di aver rispettato questa sezione. In review si controlla che non tocchi percorsi `ee/` né controlli di licenza.

## Funzionalità in programma

Le issue con l'etichetta [`idq`](https://github.com/idq-org/docmost/issues?q=is%3Aopen+label%3Aidq), nell'ordine proposto. Si può lavorare in parallelo su più issue, se c'è chi ci lavora.

1. [#8](https://github.com/idq-org/docmost/issues/8): link al codice sorgente nell'interfaccia, prima o insieme alla prima funzionalità
2. [#5](https://github.com/idq-org/docmost/issues/5): MCP integrato, compatibile con i client dell'MCP di Docmost (prima le chiavi API, poi `/mcp`, poi OAuth)
3. [#3](https://github.com/idq-org/docmost/issues/3): bacheca kanban dei task, con i materiali collegati
4. [#6](https://github.com/idq-org/docmost/issues/6): diagrammi, con Draw.io sul nostro server e diagrammi creati anche da API e MCP
5. [#4](https://github.com/idq-org/docmost/issues/4): mappa dei soci in pixel art
