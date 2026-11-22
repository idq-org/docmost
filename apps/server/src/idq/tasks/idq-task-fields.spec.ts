import {
  DEFAULT_TASK_VOCABULARY,
  InvalidVocabularyError,
  TaskVocabulary,
  buildAssigneeIndex,
  escapeLike,
  fieldOfLabel,
  isLabelValue,
  labelName,
  nameFromLabelValue,
  parseTaskLabels,
  planTaskLabels,
  statusLabelName,
  toLabelSlug,
  validateVocabulary,
} from './idq-task-fields';

const vocabulary = DEFAULT_TASK_VOCABULARY;

/** A workspace with its own words, and synonyms for some statuses. */
const custom: TaskVocabulary = {
  prefixes: {
    status: 'state-',
    priority: 'prio-',
    area: 'team-',
    assignee: 'owner-',
  },
  statuses: {
    todo: ['open', 'new'],
    in_progress: ['doing'],
    to_decide: ['decide'],
    waiting: ['waiting'],
    blocked: ['stuck'],
    to_review: ['review'],
    done: ['closed', 'finished'],
  },
  priorities: ['p0', 'p1', 'p2'],
};

describe('task fields', () => {
  describe('parseTaskLabels', () => {
    it('reads status, priority, areas and people in charge', () => {
      expect(
        parseTaskLabels(
          [
            'status-in-progress',
            'priority-high',
            'area-schools',
            'area-communication',
            'assignee-mario',
            'assignee-giulia-bianchi',
            'grant-2026',
          ],
          vocabulary,
        ),
      ).toEqual({
        status: 'in_progress',
        statusValue: 'in-progress',
        priority: 'high',
        areas: ['communication', 'schools'],
        assignees: ['giulia-bianchi', 'mario'],
      });
    });

    it('is not a task without a status label', () => {
      const parsed = parseTaskLabels(
        ['priority-high', 'assignee-mario'],
        vocabulary,
      );
      expect(parsed.statusValue).toBeNull();
      expect(parsed.status).toBeNull();
    });

    it('uses the vocabulary of the workspace, synonyms included', () => {
      expect(parseTaskLabels(['state-new'], custom).status).toBe('todo');
      expect(parseTaskLabels(['state-finished'], custom).status).toBe('done');
      expect(parseTaskLabels(['status-todo'], custom).statusValue).toBeNull();
    });

    it('keeps unknown statuses as raw values', () => {
      const parsed = parseTaskLabels(['status-on-hold'], vocabulary);
      expect(parsed.status).toBeNull();
      expect(parsed.statusValue).toBe('on-hold');
    });

    it('with several statuses, the first column of the board wins', () => {
      const parsed = parseTaskLabels(
        ['status-done', 'status-on-hold', 'status-waiting'],
        vocabulary,
      );
      expect(parsed.status).toBe('waiting');
      expect(parsed.statusValue).toBe('waiting');
    });

    it('with several priorities, the most urgent known one wins', () => {
      expect(
        parseTaskLabels(
          ['priority-low', 'priority-zzz', 'priority-high'],
          vocabulary,
        ).priority,
      ).toBe('high');
      expect(
        parseTaskLabels(['priority-b', 'priority-a'], vocabulary).priority,
      ).toBe('a');
    });

    it('ignores prefixes without a value', () => {
      const parsed = parseTaskLabels(
        ['status-', 'assignee-', 'status-todo'],
        vocabulary,
      );
      expect(parsed.status).toBe('todo');
      expect(parsed.assignees).toEqual([]);
    });
  });

  it('writes the first value of each status', () => {
    expect(statusLabelName('todo', vocabulary)).toBe('status-todo');
    expect(statusLabelName('done', custom)).toBe('state-closed');
    expect(labelName('area', 'design', custom)).toBe('team-design');
  });

  describe('planTaskLabels', () => {
    const current = [
      'status-todo',
      'priority-high',
      'area-schools',
      'assignee-anna',
    ];

    it('moves the task to another column', () => {
      const plan = planTaskLabels(current, { status: 'done' }, vocabulary);
      expect(plan.add).toEqual(['status-done']);
      expect(plan.remove).toEqual(['status-todo']);
      expect(plan.before.status).toBe('todo');
      expect(plan.after.status).toBe('done');
      expect(plan.after.priority).toBe('high');
    });

    it('changes nothing when the task is already in the column', () => {
      // "new" is a synonym of todo: it stays as it is
      const plan = planTaskLabels(
        ['state-new', 'prio-p0'],
        { status: 'todo' },
        custom,
      );
      expect(plan).toMatchObject({ add: [], remove: [] });
      expect(plan.before.status).toBe('todo');
      expect(plan.after.status).toBe('todo');
    });

    it('replaces only the fields given', () => {
      const plan = planTaskLabels(
        current,
        { priority: [], assignee: ['anna', 'bruno'] },
        vocabulary,
      );
      expect(plan.add).toEqual(['assignee-bruno']);
      expect(plan.remove).toEqual(['priority-high']);
      expect(plan.after).toMatchObject({
        status: 'todo',
        priority: null,
        areas: ['schools'],
        assignees: ['anna', 'bruno'],
      });
    });

    it('removes every status label, known or not, when the task moves', () => {
      const plan = planTaskLabels(
        ['status-archived', 'status-blocked', 'status-done'],
        { status: 'todo' },
        vocabulary,
      );
      expect(plan.before.status).toBe('blocked');
      expect(plan.add).toEqual(['status-todo']);
      expect(plan.remove.sort()).toEqual([
        'status-archived',
        'status-blocked',
        'status-done',
      ]);
      expect(plan.after.status).toBe('todo');
    });

    it('gives a new page its first status', () => {
      const plan = planTaskLabels([], { status: 'waiting' }, vocabulary);
      expect(plan.add).toEqual(['status-waiting']);
      expect(plan.before.statusValue).toBeNull();
      expect(plan.before.status).toBeNull();
      expect(plan.after.status).toBe('waiting');
    });

    it('does not take a label of a field with a longer prefix for another', () => {
      const prefixes = { ...custom.prefixes, area: 'a-', assignee: 'ab-' };
      const vocab = { ...custom, prefixes };
      const plan = planTaskLabels(['a-x', 'ab-y'], { area: ['z'] }, vocab);
      expect(plan.add).toEqual(['a-z']);
      expect(plan.remove).toEqual(['a-x']);
      expect(plan.after.assignees).toEqual(['y']);
    });
  });

  it('tells which field a label belongs to', () => {
    expect(fieldOfLabel('owner-anna', custom)).toEqual({
      field: 'assignee',
      value: 'anna',
    });
    expect(fieldOfLabel('owner-', custom)).toBeNull();
    expect(fieldOfLabel('budget', custom)).toBeNull();
  });

  describe('validateVocabulary', () => {
    it('accepts the defaults and normalizes case and spaces', () => {
      expect(validateVocabulary(DEFAULT_TASK_VOCABULARY)).toEqual(
        DEFAULT_TASK_VOCABULARY,
      );
      const loose = {
        ...custom,
        prefixes: { ...custom.prefixes, status: ' State- ' },
        priorities: ['P0', 'p0', 'p1'],
      };
      const clean = validateVocabulary(loose);
      expect(clean.prefixes.status).toBe('state-');
      expect(clean.priorities).toEqual(['p0', 'p1']);
    });

    const invalid: Array<[string, unknown]> = [
      [
        'a missing prefix',
        { ...custom, prefixes: { ...custom.prefixes, area: '' } },
      ],
      [
        'a prefix that starts another one',
        { ...custom, prefixes: { ...custom.prefixes, area: 'state-x-' } },
      ],
      [
        'a prefix with spaces inside',
        { ...custom, prefixes: { ...custom.prefixes, area: 'my team-' } },
      ],
      [
        'a status without values',
        { ...custom, statuses: { ...custom.statuses, done: [] } },
      ],
      [
        'a value used by two statuses',
        { ...custom, statuses: { ...custom.statuses, done: ['open'] } },
      ],
      ['an invalid value', { ...custom, priorities: ['~p0'] }],
      ['no priorities list', { ...custom, priorities: 'p0' }],
      ['nothing at all', undefined],
    ];
    it.each(invalid)('rejects %s', (_name, input) => {
      expect(() => validateVocabulary(input)).toThrow(InvalidVocabularyError);
    });
  });

  it('accepts only values that can follow a prefix in a label', () => {
    expect(isLabelValue('in-progress')).toBe(true);
    expect(isLabelValue('a_b~c')).toBe(true);
    expect(isLabelValue('')).toBe(false);
    expect(isLabelValue('~hidden')).toBe(false);
    expect(isLabelValue('Open')).toBe(false);
    expect(isLabelValue('x'.repeat(71))).toBe(false);
  });

  it('escapes LIKE wildcards', () => {
    expect(escapeLike('my_prefix%\\')).toBe('my\\_prefix\\%\\\\');
  });

  it('slugs names like label names', () => {
    expect(toLabelSlug('  Niccolò  D’Amico ')).toBe('niccolo-d-amico');
    expect(toLabelSlug('a.giulianini')).toBe('a-giulianini');
    expect(toLabelSlug('~tilde first')).toBe('tilde-first');
    // Already decomposed: the combining marks go, the letters stay
    expect(toLabelSlug('Nicolo\u0300 A\u030Angstro\u0308m')).toBe(
      'nicolo-angstrom',
    );
  });

  it('turns a value into a name', () => {
    expect(nameFromLabelValue('mario-rossi')).toBe('Mario Rossi');
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
