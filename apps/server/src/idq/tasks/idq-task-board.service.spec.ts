import { ForbiddenException, Logger } from '@nestjs/common';
import { User, Workspace } from '@docmost/db/types/entity.types';

// The board gets stubs: these modules would load Docmost's controllers.
jest.mock('../core/idq-docmost.service', () => ({ IdqDocmost: class {} }));
jest.mock('../core/idq-page-access.service', () => ({
  IdqPageAccess: class {},
}));
import {
  IDQ_TASK_STATUS_CHANGED,
  IdqTaskBoardService,
} from './idq-task-board.service';
import { DEFAULT_TASK_VOCABULARY, ParsedTaskLabels } from './idq-task-fields';

const user = { id: 'user-1', locale: 'en-US' } as User;
const workspace = { id: 'ws-1' } as Workspace;
const page = {
  id: 'page-1',
  slugId: 'abc123',
  title: 'Call the school',
  icon: null,
  spaceId: 'space-1',
  position: 'a0',
  parentPageId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const todo: ParsedTaskLabels = {
  status: 'todo',
  statusValue: 'todo',
  priority: null,
  areas: [],
  assignees: [],
};

/** The board with stubs for everything it uses. */
function setup() {
  const deps = {
    docmost: {
      pageController: { create: jest.fn().mockResolvedValue(page) },
      pageService: {
        parseProsemirrorContent: jest
          .fn()
          .mockResolvedValue({ type: 'doc', content: [] }),
        forceDelete: jest.fn().mockResolvedValue(undefined),
      },
    },
    eventEmitter: { emit: jest.fn() },
    access: {
      spacePermissions: jest.fn().mockResolvedValue({ canEdit: true }),
      findEditablePage: jest.fn().mockResolvedValue(page),
    },
    labelStore: {
      usualTaskParent: jest.fn().mockResolvedValue(null),
      writeFields: jest.fn(),
      findPageTask: jest.fn().mockResolvedValue(todo),
      findPagesTasks: jest.fn().mockResolvedValue(new Map()),
    },
    links: {
      listForTask: jest.fn().mockResolvedValue([]),
      linkingPages: jest.fn().mockResolvedValue([]),
      countForTasks: jest.fn().mockResolvedValue(new Map()),
    },
    assignees: { resolver: jest.fn().mockResolvedValue((v: string) => v) },
    settings: {
      vocabulary: jest.fn().mockResolvedValue(DEFAULT_TASK_VOCABULARY),
    },
    audit: { log: jest.fn() },
  };
  const board = new IdqTaskBoardService(
    {} as any,
    deps.docmost as any,
    deps.eventEmitter as any,
    {} as any,
    deps.access as any,
    deps.labelStore as any,
    deps.links as any,
    deps.assignees as any,
    deps.settings as any,
    deps.audit as any,
  );
  return { board, ...deps };
}

describe('IdqTaskBoardService', () => {
  describe('status-changed event', () => {
    it('reports the status the store really replaced', async () => {
      const { board, labelStore, eventEmitter } = setup();
      labelStore.writeFields.mockResolvedValue({
        previousStatus: 'blocked',
        status: 'done',
      });

      await board.setStatus(page.id, 'done', user, workspace);

      expect(labelStore.writeFields).toHaveBeenCalledWith(
        page.id,
        workspace.id,
        DEFAULT_TASK_VOCABULARY,
        expect.objectContaining({ status: 'done' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledTimes(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(IDQ_TASK_STATUS_CHANGED, {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: workspace.id,
        userId: user.id,
        status: 'done',
        previousStatus: 'blocked',
      });
    });

    it('is not emitted when the status stays the same', async () => {
      const { board, labelStore, eventEmitter } = setup();
      labelStore.writeFields.mockResolvedValue({
        previousStatus: 'todo',
        status: 'todo',
      });

      await board.setStatus(page.id, 'todo', user, workspace);
      await board.setFields(page.id, { priority: 'high' }, user, workspace);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('turns a null priority into no priority label', async () => {
      const { board, labelStore } = setup();
      labelStore.writeFields.mockResolvedValue({
        previousStatus: 'todo',
        status: 'todo',
      });

      await board.setFields(page.id, { priority: null }, user, workspace);

      expect(labelStore.writeFields.mock.calls[0][3]).toEqual({
        status: undefined,
        priority: [],
        area: undefined,
        assignee: undefined,
      });
    });
  });

  describe('createTask', () => {
    const input = {
      spaceId: page.spaceId,
      title: page.title,
      status: 'waiting' as const,
    };

    it('creates the page with JSON content and reports the new task', async () => {
      const { board, docmost, labelStore, eventEmitter } = setup();
      labelStore.writeFields.mockResolvedValue({
        previousStatus: null,
        status: 'waiting',
      });

      const created = await board.createTask(
        { ...input, content: '  ' },
        user,
        workspace,
      );

      // Empty content gets the template
      expect(docmost.pageService.parseProsemirrorContent).toHaveBeenCalledWith(
        expect.stringContaining('## Goal'),
        'markdown',
      );
      expect(docmost.pageController.create).toHaveBeenCalledWith(
        expect.objectContaining({
          content: { type: 'doc', content: [] },
          format: 'json',
        }),
        user,
        workspace,
      );
      expect(created.task.pageId).toBe(page.id);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        IDQ_TASK_STATUS_CHANGED,
        expect.objectContaining({ status: 'waiting', previousStatus: null }),
      );
    });

    it('falls back to the root when the usual parent is not writable', async () => {
      const { board, docmost, labelStore } = setup();
      labelStore.usualTaskParent.mockResolvedValue('index-page');
      labelStore.writeFields.mockResolvedValue({
        previousStatus: null,
        status: 'waiting',
      });
      docmost.pageController.create
        .mockRejectedValueOnce(new ForbiddenException())
        .mockResolvedValueOnce(page);

      await board.createTask(input, user, workspace);

      const parents = docmost.pageController.create.mock.calls.map(
        ([dto]) => dto.parentPageId,
      );
      expect(parents).toEqual(['index-page', undefined]);
    });

    it('removes the new page if its status cannot be written', async () => {
      const { board, docmost, labelStore, eventEmitter, audit } = setup();
      const failure = new Error('label write failed');
      labelStore.writeFields.mockRejectedValue(failure);

      await expect(board.createTask(input, user, workspace)).rejects.toBe(
        failure,
      );

      expect(docmost.pageService.forceDelete).toHaveBeenCalledWith(
        page.id,
        workspace.id,
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'page.deleted', resourceId: page.id }),
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('reports the original error even if the cleanup fails', async () => {
      const { board, docmost, labelStore } = setup();
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const failure = new Error('label write failed');
      labelStore.writeFields.mockRejectedValue(failure);
      docmost.pageService.forceDelete.mockRejectedValue(new Error('db down'));

      await expect(board.createTask(input, user, workspace)).rejects.toBe(
        failure,
      );
    });
  });
});
