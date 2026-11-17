import { newTaskContent } from './idq-task-template';

describe('newTaskContent', () => {
  it('writes the sections in the language of the user', () => {
    const italian = newTaskContent('it-IT');
    expect(italian).toContain('| **Dipende da** | — |');
    expect(italian).toContain('## Obiettivo');
    expect(italian).toContain('- [ ] Primo passo');
    expect(newTaskContent('en-US')).toContain('## Goal');
  });

  it('falls back to English', () => {
    expect(newTaskContent(null)).toBe(newTaskContent('en-US'));
    expect(newTaskContent('de-DE')).toBe(newTaskContent('en'));
  });
});
