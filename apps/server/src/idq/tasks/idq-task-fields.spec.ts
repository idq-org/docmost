import {
  buildAssigneeIndex,
  humanizeLabelValue,
  isLabelValue,
  parseTaskLabels,
  statusLabelName,
  toLabelSlug,
} from './idq-task-fields';

describe('idq task fields', () => {
  describe('parseTaskLabels', () => {
    it('reads status, priority, areas and assignees', () => {
      expect(
        parseTaskLabels([
          'stato-in-corso',
          'priorita-alta',
          'area-scuole',
          'area-comunicazione',
          'ref-mario',
          'ref-giulia-bianchi',
          'bando-2026',
        ]),
      ).toEqual({
        status: 'in_progress',
        statusValue: 'in-corso',
        priority: 'alta',
        areas: ['comunicazione', 'scuole'],
        assignees: ['giulia-bianchi', 'mario'],
      });
    });

    it('is not a task without a status label', () => {
      const parsed = parseTaskLabels(['priorita-alta', 'ref-mario']);
      expect(parsed.statusValue).toBeNull();
      expect(parsed.status).toBeNull();
    });

    it('accepts both forms of gendered statuses', () => {
      expect(parseTaskLabels(['stato-bloccato']).status).toBe('blocked');
      expect(parseTaskLabels(['stato-bloccata']).status).toBe('blocked');
      expect(parseTaskLabels(['stato-fatta']).status).toBe('done');
    });

    it('keeps unknown statuses as raw values', () => {
      const parsed = parseTaskLabels(['stato-sospeso']);
      expect(parsed.status).toBeNull();
      expect(parsed.statusValue).toBe('sospeso');
    });

    it('with several statuses, the first column of the board wins', () => {
      const parsed = parseTaskLabels([
        'stato-fatto',
        'stato-sospeso',
        'stato-in-attesa',
      ]);
      expect(parsed.status).toBe('waiting');
      expect(parsed.statusValue).toBe('in-attesa');
    });

    it('ignores prefixes without a value', () => {
      const parsed = parseTaskLabels(['stato-', 'ref-', 'stato-da-fare']);
      expect(parsed.status).toBe('todo');
      expect(parsed.assignees).toEqual([]);
    });
  });

  it('writes the first label of each status', () => {
    expect(statusLabelName('todo')).toBe('stato-da-fare');
    expect(statusLabelName('blocked')).toBe('stato-bloccata');
    expect(statusLabelName('done')).toBe('stato-fatto');
  });

  it('slugs names like label names', () => {
    expect(toLabelSlug('  Niccolò  D’Amico ')).toBe('niccolo-d-amico');
    expect(toLabelSlug('a.giulianini')).toBe('a-giulianini');
  });

  it('accepts only values that can follow a prefix in a label', () => {
    expect(isLabelValue('offerta-formativa')).toBe(true);
    expect(isLabelValue('a_b~c')).toBe(true);
    expect(isLabelValue('')).toBe(false);
    expect(isLabelValue('~hidden')).toBe(false);
    expect(isLabelValue('Offerta')).toBe(false);
    expect(isLabelValue('x'.repeat(92))).toBe(false);
  });

  it('humanizes label values', () => {
    expect(humanizeLabelValue('mario-rossi')).toBe('Mario Rossi');
  });

  describe('buildAssigneeIndex', () => {
    const users = [
      { id: '1', name: 'Mario Rossi', email: 'mario.rossi@example.org' },
      { id: '2', name: 'Mario Verdi', email: 'mv@example.org' },
      { id: '3', name: 'Giulia Bianchi', email: 'giulia@example.org' },
      { id: '4', name: null, email: 'anna@example.org' },
    ];
    const index = buildAssigneeIndex(users);

    it('matches full names, unique first names and emails', () => {
      expect(index.get('mario-rossi')?.id).toBe('1');
      expect(index.get('mario-verdi')?.id).toBe('2');
      expect(index.get('giulia')?.id).toBe('3');
      expect(index.get('giulia-bianchi')?.id).toBe('3');
      expect(index.get('mv')?.id).toBe('2');
      expect(index.get('anna')?.id).toBe('4');
    });

    it('does not guess ambiguous first names', () => {
      expect(index.has('mario')).toBe(false);
    });
  });
});
