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

## Sviluppo in locale

```sh
git clone https://github.com/idq-org/docmost.git && cd docmost
git remote add upstream https://github.com/docmost/docmost.git
git remote set-url --push upstream DISABLE   # niente push per errore verso l'originale
gh repo set-default idq-org/docmost          # le PR di gh vanno qui, non su docmost/docmost
```

Il submodule `apps/server/src/ee` punta alla versione Enterprise di Docmost, che è privata: non serve e non va inizializzato.

## Regole per le modifiche

- Modifiche piccole, e file nuovi invece di modifiche a file esistenti dove si può: meno conflitti a ogni aggiornamento.
- Niente credenziali né dati dell'associazione nel repo: il fork è pubblico (licenza AGPL-3.0).
- Le PR vanno verso `idq` di questo repo, mai verso `docmost/docmost`.
