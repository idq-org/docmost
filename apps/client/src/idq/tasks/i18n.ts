import i18n from "@/i18n";

// Italian translations of the task board. They live here, not in
// public/locales, so they never conflict with Docmost's translation updates.
// The keys are the English text, as in the rest of the app. On a key that
// Docmost translates too, Docmost's translation is used.
const it: Record<string, string> = {
  // Board
  Board: "Bacheca",
  "Tasks of {{space}}": "Task di {{space}}",
  "Open board": "Apri la bacheca",
  "Failed to load the board": "Caricamento della bacheca non riuscito",
  "The space may not exist, or you may not have access to it.":
    "Lo spazio potrebbe non esistere, oppure non hai accesso.",
  "No tasks yet. Create one in a column, or add a status label to an existing page.":
    "Ancora nessun task. Creane uno in una colonna, oppure aggiungi un'etichetta di stato a una pagina esistente.",
  "There are no tasks in this space yet.":
    "In questo spazio non ci sono ancora task.",

  // Columns
  "To do": "Da fare",
  "In progress": "In corso",
  "To decide": "Da decidere",
  Waiting: "In attesa",
  Blocked: "Bloccata",
  "To review": "Da verificare",
  Done: "Fatto",
  "Other status": "Altro stato",

  // Cards
  "Move to": "Sposta in",
  "{{title}} moved to {{status}}": "«{{title}}» spostato in {{status}}",
  "Change status: {{status}}": "Cambia stato: {{status}}",
  "Next deadline": "Prossima scadenza",
  Overdue: "Scaduta",
  "{{count}} linked materials": "{{count}} materiali collegati",
  "{{count}} linked materials_one": "{{count}} materiale collegato",
  "{{count}} linked materials_other": "{{count}} materiali collegati",
  "Failed to move the task": "Spostamento del task non riuscito",

  // New task
  "New task": "Nuovo task",
  "Task title": "Titolo del task",
  "Enter to create, Esc to cancel": "Invio per creare, Esc per annullare",
  "Failed to create the task": "Creazione del task non riuscita",

  // Sections of a new task page
  Field: "Campo",
  Value: "Valore",
  Deadline: "Scadenza",
  "Depends on": "Dipende da",
  Goal: "Obiettivo",
  Steps: "Passi",
  "First step": "Primo passo",
  References: "Riferimenti",

  // Filters
  Priority: "Priorità",
  Area: "Area",
  "Person in charge": "Referente",
  "My tasks": "I miei task",
  "Clear filters": "Togli i filtri",
  "No tasks match the filters.": "Nessun task corrisponde ai filtri.",

  // Task fields
  "Edit task": "Modifica il task",
  "Edit priority, area and people in charge":
    "Modifica priorità, area e referenti",
  "No priority": "Nessuna priorità",
  "Choose one or type a new one": "Scegline una o scrivine una nuova",
  "People in charge": "Referenti",
  "To be assigned": "Da assegnare",
  "No one found": "Nessuno trovato",
  Members: "Membri",
  "Without an account": "Senza account",
  "Someone without an account": "Una persona senza account",
  "Name and surname": "Nome e cognome",
  "Add to the people in charge": "Aggiungi ai referenti",
  Cancel: "Annulla",
  Save: "Salva",
  "Failed to save the task": "Salvataggio del task non riuscito",

  // Board settings (workspace admins)
  "Board settings": "Impostazioni della bacheca",
  Labels: "Etichette",
  "The board reads tasks from page labels. Changing these words doesn't rename the labels already on pages.":
    "La bacheca legge i task dalle etichette delle pagine. Cambiare queste parole non rinomina le etichette già presenti.",
  Prefixes: "Prefissi",
  Status: "Stato",
  Columns: "Colonne",
  "The first value is written when a card moves; the others are also read.":
    "Il primo valore si scrive quando una card si sposta; anche gli altri vengono letti.",
  Example: "Esempio",
  Priorities: "Priorità",
  "Most urgent first: the board orders and colors them.":
    "Dalla più urgente: la bacheca le ordina e le colora così.",
  "Failed to save the settings": "Salvataggio delle impostazioni non riuscito",
  "Choose who each person-in-charge label stands for. Without a choice, the label is matched with a member's name or email, when only one member fits.":
    "Scegli chi è ogni etichetta di referente. Senza una scelta, l'etichetta viene abbinata al nome o alla mail di un membro, se ce n'è uno solo che corrisponde.",
  Label: "Etichetta",
  Member: "Membro",
  "Member for {{label}}": "Membro per {{label}}",
  "Automatic: {{name}}": "Automatico: {{name}}",
  "No member: shown as a name": "Nessun membro: si vede come nome",
  "No person-in-charge labels yet.":
    "Non ci sono ancora etichette di referenti.",
  "Failed to save the person in charge":
    "Salvataggio del referente non riuscito",

  // Linked materials
  "Linked materials": "Materiali collegati",
  "No linked materials yet.": "Ancora nessun materiale collegato.",
  "Used in tasks": "Usata nei task",
  Add: "Aggiungi",
  Remove: "Rimuovi",
  "Remove {{title}}": "Rimuovi «{{title}}»",
  "Link material": "Collega un materiale",
  Page: "Pagina",
  File: "File",
  "External link": "Link esterno",
  "Search pages": "Cerca pagine",
  "No pages found": "Nessuna pagina trovata",
  "Upload a file to this task, or link a file already in Docmost.":
    "Carica un file in questo task, oppure collega un file già presente in Docmost.",
  "Upload file": "Carica un file",
  "Search files by name": "Cerca i file per nome",
  "No files found": "Nessun file trovato",
  Address: "Indirizzo",
  Title: "Titolo",
  "Optional: shown instead of the address":
    "Facoltativo: si vede al posto dell'indirizzo",
  "Add the link": "Aggiungi il link",
  "Enter a web address that starts with https://":
    "Inserisci un indirizzo web che inizia con https://",
  "Failed to link the material": "Collegamento del materiale non riuscito",
  "Failed to remove the material": "Rimozione del materiale non riuscita",
  "Failed to upload the file": "Caricamento del file non riuscito",
};

function register() {
  i18n.addResourceBundle("it-IT", "translation", it, true, false);
}

register();
// The http backend loads Docmost's translations later: add ours again.
i18n.on("loaded", register);
