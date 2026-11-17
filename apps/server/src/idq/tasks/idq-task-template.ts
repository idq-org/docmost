/**
 * Markdown of a new task page: a table for what labels can't hold, then
 * goal, steps (a checklist) and references, in the user's language. Status,
 * priority, area and people in charge are labels, shown in the panel under
 * the title. IdqTaskBoardService.createTask writes it for the web board and
 * the MCP alike, so every new task starts the same way.
 */
const SECTIONS = {
  en: {
    field: 'Field',
    value: 'Value',
    deadline: 'Deadline',
    dependsOn: 'Depends on',
    goal: 'Goal',
    steps: 'Steps',
    firstStep: 'First step',
    references: 'References',
  },
  it: {
    field: 'Campo',
    value: 'Valore',
    deadline: 'Scadenza',
    dependsOn: 'Dipende da',
    goal: 'Obiettivo',
    steps: 'Passi',
    firstStep: 'Primo passo',
    references: 'Riferimenti',
  },
};

/** `locale` is the user's (e.g. "it-IT"); other languages get English. */
export function newTaskContent(locale: string | null | undefined): string {
  const s = locale?.toLowerCase().startsWith('it') ? SECTIONS.it : SECTIONS.en;
  return [
    `| ${s.field} | ${s.value} |`,
    '| --- | --- |',
    `| **${s.deadline}** | — |`,
    `| **${s.dependsOn}** | — |`,
    '',
    `## ${s.goal}`,
    '',
    `## ${s.steps}`,
    '',
    // An empty checklist item would become plain text.
    `- [ ] ${s.firstStep}`,
    '',
    `## ${s.references}`,
    '',
  ].join('\n');
}
