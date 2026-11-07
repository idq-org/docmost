import {
  DEFAULT_TASK_VOCABULARY,
  InvalidVocabularyError,
  TaskVocabulary,
  buildAssigneeIndex,
  escapeLike,
  fieldOfLabel,
  isLabelValue,
  nameFromLabelValue,
  parseTaskLabels,
  statusLabelName,
  toLabelSlug,
  validateVocabulary,
} from './idq-task-fields';
import { KeyedMutex } from './keyed-mutex';

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

describe('KeyedMutex', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

  it('runs tasks with the same key one at a time, in order', async () => {
    const mutex = new KeyedMutex();
    const events: string[] = [];
    const task = (name: string) => async () => {
      events.push(`${name} start`);
      await tick();
      events.push(`${name} end`);
      return name;
    };

    const results = await Promise.all([
      mutex.run('page', task('a')),
      mutex.run('page', task('b')),
      mutex.run('other', task('c')),
    ]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events.indexOf('a end')).toBeLessThan(events.indexOf('b start'));
    // Another key doesn't wait.
    expect(events.indexOf('c start')).toBeLessThan(events.indexOf('a end'));
  });

  it('goes on after a failed task', async () => {
    const mutex = new KeyedMutex();
    const failed = mutex.run('page', async () => {
      throw new Error('boom');
    });
    const next = mutex.run('page', async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
