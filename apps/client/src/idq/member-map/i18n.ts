import { addTranslations } from "@/idq/core/i18n";

// Translations of the members map (see addTranslations). English only needs
// the singular forms: the keys are the English plural.
addTranslations("en-US", {
  "{{count}} members_one": "{{count}} member",
  "{{count}} members_other": "{{count}} members",
  "{{count}} members without a name_one": "{{count}} member without a name",
  "{{count}} members without a name_other": "{{count}} members without a name",
  "and {{count}} more without a name_one": "and {{count}} more without a name",
  "and {{count}} more without a name_other":
    "and {{count}} more without a name",
  "Save {{count}} changes_one": "Save {{count}} change",
  "Save {{count}} changes_other": "Save {{count}} changes",
  "Saved: {{count}} members_one": "Saved: {{count}} member",
  "Saved: {{count}} members_other": "Saved: {{count}} members",
  "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active._one":
    "Saved: {{count}} member. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active.",
  "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active._other":
    "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active.",
  "Filled in {{count}} members: check the table, then save._one":
    "Filled in {{count}} member: check the table, then save.",
  "Filled in {{count}} members: check the table, then save._other":
    "Filled in {{count}} members: check the table, then save.",
  "{{count}} members to fill in_one": "{{count}} member to fill in",
  "{{count}} members to fill in_other": "{{count}} members to fill in",
  "{{count}} rows left out_one": "{{count}} row left out",
  "{{count}} rows left out_other": "{{count}} rows left out",
});

addTranslations("it-IT", {
  // Page
  "Members map": "Mappa dei soci",
  "Where the members live, by province. Each member chooses whether to be on the map, and whether to show their name.":
    "Dove vivono i soci, per provincia. Ognuno sceglie se comparire sulla mappa e se mostrare il proprio nome.",
  "Failed to load the members map":
    "Caricamento della mappa dei soci non riuscito",
  "Try again in a few minutes.": "Riprova fra qualche minuto.",
  Members_idq: "Soci",
  Provinces: "Province",
  Regions: "Regioni",
  "Members by province": "Soci per provincia",
  "Nobody is on the map yet.": "Sulla mappa non c'è ancora nessuno.",
  "Be the first: add your province.": "Comincia tu: aggiungi la tua provincia.",
  "Provinces and boundaries:": "Province e confini:",

  // Map
  "Map of Italy with the members by province. Members: {{members}}; provinces: {{provinces}}.":
    "Mappa d'Italia con i soci per provincia. Soci: {{members}}; province: {{provinces}}.",
  "Select a province to see its members":
    "Seleziona una provincia per vedere i suoi soci",
  "No members": "Nessun socio",
  "5 or more": "5 o più",
  "No members yet": "Ancora nessun socio",
  "No members in {{province}} yet":
    "Ancora nessun socio in provincia di {{province}}",
  "{{count}} members_one": "{{count}} socio",
  "{{count}} members_other": "{{count}} soci",
  "{{count}} members without a name_one": "{{count}} socio senza nome",
  "{{count}} members without a name_other": "{{count}} soci senza nome",
  "and {{count}} more without a name_one": "e {{count}} altro senza nome",
  "and {{count}} more without a name_other": "e altri {{count}} senza nome",

  // Where I am
  "You are not on the map.": "Non sei sulla mappa.",
  "You are on the map in {{province}}, with your name.":
    "Sei sulla mappa in provincia di {{province}}, con il tuo nome.",
  "You are on the map in {{province}}, without your name.":
    "Sei sulla mappa in provincia di {{province}}, senza il tuo nome.",
  "Add your province": "Aggiungi la tua provincia",
  Change: "Cambia",

  // Profile
  "Show the other members which province you live in: only the province, never your town or address. Only members logged in to the workspace see the map.":
    "Fai sapere agli altri soci in che provincia vivi: solo la provincia, mai il comune o l'indirizzo. La mappa la vede solo chi ha fatto l'accesso al workspace.",
  "On the map": "Sulla mappa",
  "Don't show me": "Non mostrarmi",
  "You are not on the map, and your province is not kept.":
    "Non compari sulla mappa, e la tua provincia non viene salvata.",
  "Count me, without my name": "Contami, senza nome",
  "You add one to the members of your province.":
    "Conti uno in più fra i soci della tua provincia.",
  "Show my name": "Mostra il mio nome",
  "Members see your name and avatar in your province.":
    "I soci vedono il tuo nome e la tua foto nella tua provincia.",
  Province: "Provincia",
  "Choose your province": "Scegli la tua provincia",
  "No province found": "Nessuna provincia trovata",
  "Open the members map": "Apri la mappa dei soci",
  "Members map updated": "Mappa dei soci aggiornata",
  "Failed to update the members map":
    "Aggiornamento della mappa dei soci non riuscito",

  // Shown to the member when an admin put them on the map
  "An admin": "Un admin",
  "{{admin}} put you on the map in {{province}}, with your name.":
    "{{admin}} ti ha messo sulla mappa in provincia di {{province}}, con il tuo nome.",
  "{{admin}} put you on the map in {{province}}, without your name.":
    "{{admin}} ti ha messo sulla mappa in provincia di {{province}}, senza il tuo nome.",
  "{{admin}} put you on the map, with your consent. You can change or remove it here: from then on it's your choice.":
    "{{admin}} ti ha messo sulla mappa, con il tuo consenso. Puoi cambiare o togliere la scelta qui: da quel momento è tua.",

  // Management (admins)
  Manage: "Gestisci",
  "Manage the members map": "Gestisci la mappa dei soci",
  "Only workspace admins can manage the members map":
    "Solo gli admin del workspace possono gestire la mappa dei soci",
  "Each member chooses in their own profile.":
    "Ogni socio sceglie dal proprio profilo.",
  "Failed to load the members": "Caricamento dei soci non riuscito",
  "Put on the map only the members who gave their consent. They see that an admin did it, and can change or remove it in their profile. What a member chose in their profile can't be changed here.":
    "Metti sulla mappa solo i soci che hanno dato il consenso. Vedranno che l'ha fatto un admin e potranno cambiare o togliere la scelta dal loro profilo. Quello che un socio ha scelto dal profilo qui non si può cambiare.",
  "Search by name or email": "Cerca per nome o email",
  "Import from a file": "Importa da un file",
  "Discard changes": "Annulla le modifiche",
  Save: "Salva",
  "Save {{count}} changes_one": "Salva {{count}} modifica",
  "Save {{count}} changes_other": "Salva {{count}} modifiche",
  "Saved: {{count}} members_one": "Salvato: {{count}} socio",
  "Saved: {{count}} members_other": "Salvati: {{count}} soci",
  "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active._one":
    "Salvato: {{count}} socio. {{skipped}} lasciati com'erano: nel frattempo hanno scelto dal profilo, o non sono più attivi.",
  "Saved: {{count}} members. {{skipped}} left as they were: in the meantime they chose in their profile, or are no longer active._other":
    "Salvati: {{count}} soci. {{skipped}} lasciati com'erano: nel frattempo hanno scelto dal profilo, o non sono più attivi.",
  Member_idq: "Socio",
  "Set by": "Impostato da",
  "Not on the map": "Non sulla mappa",
  "Without name": "Senza nome",
  "With name": "Con nome",
  "Choose a province": "Scegli una provincia",
  "Province of {{name}}": "Provincia di {{name}}",
  "Visibility of {{name}}": "Visibilità di {{name}}",
  "Not saved": "Da salvare",
  "The member": "Il socio",
  "Chosen in their profile: only they can see and change it.":
    "Scelto dal suo profilo: può vederlo e cambiarlo solo lui.",

  // Import
  'A CSV file (from Excel: Save as › CSV UTF-8) whose first row names the columns: "email", "provincia" (abbreviation or name) and, if you want, "visibilità" ("con nome" or "senza nome").':
    "Un file CSV (da Excel: Salva con nome › CSV UTF-8) con nella prima riga i nomi delle colonne: «email», «provincia» (sigla o nome) e, se vuoi, «visibilità» («con nome» o «senza nome»).",
  "The file is read in your browser: other columns, such as addresses, never leave your computer. Nothing is saved until you save the table.":
    "Il file viene letto nel tuo browser: le altre colonne, come gli indirizzi, non escono dal tuo computer. Non si salva niente finché non salvi la tabella.",
  File: "File",
  "Choose a CSV file": "Scegli un file CSV",
  "Rows without a visibility": "Righe senza visibilità",
  'The first row must name the columns: "email" and "provincia" (and, if you want, "visibilità").':
    "La prima riga deve avere i nomi delle colonne: «email» e «provincia» (e, se vuoi, «visibilità»).",
  "The file can't be read: save it from Excel as CSV.":
    "Il file non si riesce a leggere: salvalo da Excel come CSV.",
  "{{count}} members to fill in_one": "{{count}} socio da compilare",
  "{{count}} members to fill in_other": "{{count}} soci da compilare",
  "{{count}} rows left out_one": "{{count}} riga esclusa",
  "{{count}} rows left out_other": "{{count}} righe escluse",
  "Row {{line}}": "Riga {{line}}",
  "No email": "Senza email",
  "Email repeated in the file": "Email ripetuta nel file",
  "No Docmost account with this email":
    "Nessun account Docmost con questa email",
  "The member already chose in their profile":
    "Il socio ha già scelto dal profilo",
  'Unknown province "{{value}}"': "Provincia sconosciuta «{{value}}»",
  'Unknown visibility "{{value}}"': "Visibilità sconosciuta «{{value}}»",
  Cancel: "Annulla",
  "Fill in the table": "Compila la tabella",
  "Filled in {{count}} members: check the table, then save._one":
    "Compilato {{count}} socio: controlla la tabella, poi salva.",
  "Filled in {{count}} members: check the table, then save._other":
    "Compilati {{count}} soci: controlla la tabella, poi salva.",
});
