import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import {
  IdqTaskAddLinkDto,
  IdqTaskAssigneeDto,
  IdqTaskBoardDto,
  IdqTaskCreateDto,
  IdqTaskLinkIdDto,
  IdqTaskPageDto,
  IdqTaskSetFieldsDto,
  IdqTaskSetStatusDto,
  IdqTaskSettingsDto,
} from '../../tasks/idq-tasks.controller';
import { TASK_STATUSES, toLabelSlug } from '../../tasks/idq-task-fields';
import { toDto } from '../idq-mcp-core.service';
import { defineTool } from './tool-context';

const pageId = z
  .string()
  .min(1)
  .describe(
    'Page ID (UUID) or the short slug ID shown at the end of page URLs',
  );
const spaceId = z.string().uuid().describe('Space ID (UUID)');
const status = z.enum(TASK_STATUSES).describe('Column of the board');
const labelValue = z.string().min(1).max(70);

const valueDescription =
  'A value or a name: "Mario Rossi" is stored as "mario-rossi".';

/**
 * Task board tools. Each one calls the service behind an endpoint of
 * IdqTasksController, with the same DTO, so it runs the same checks as the
 * web app.
 */
export const taskTools = [
  defineTool({
    name: 'list_tasks',
    title: 'List tasks',
    description:
      'List the tasks on the board of a space, with status, priority, ' +
      'areas, people in charge, next deadline and number of linked ' +
      'materials. Optional filters, as on the board; a task with an empty ' +
      'assignees list has nobody in charge.',
    inputSchema: z.object({
      space_id: spaceId,
      priority: labelValue.optional().describe('Only tasks with this priority'),
      area: labelValue.optional().describe('Only tasks of this area'),
      assignee: labelValue
        .optional()
        .describe(`Only tasks of this person in charge. ${valueDescription}`),
      mine: z
        .boolean()
        .optional()
        .describe('Only tasks the user is in charge of (default false)'),
    }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskBoardDto, { spaceId: args.space_id });
      const board = await ctx.taskBoard.getBoard(dto.spaceId, user, workspace);

      const priority = args.priority && toLabelSlug(args.priority);
      const area = args.area && toLabelSlug(args.area);
      const assignee = args.assignee && toLabelSlug(args.assignee);
      const tasks = board.tasks.filter(
        (task) =>
          (!priority || task.priority === priority) &&
          (!area || task.areas.includes(area)) &&
          (!assignee || task.assignees.some((a) => a.value === assignee)) &&
          (!args.mine || task.assignees.some((a) => a.user?.id === user.id)),
      );
      return {
        ...board,
        tasks: tasks.map((task) => ({
          ...task,
          url: ctx.core.pageUrl(board.space.slug, task.slugId, task.title),
        })),
      };
    },
  }),

  defineTool({
    name: 'get_task',
    title: 'Get task',
    description:
      'Get the task fields of a page (status, priority, areas, people in ' +
      'charge, next deadline), its linked materials and the tasks that link ' +
      'it. isTask is false when the page is not a task. Use get_page for ' +
      'the content.',
    inputSchema: z.object({ page_id: pageId }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskPageDto, { pageId: args.page_id });
      return ctx.taskBoard.getPageInfo(dto.pageId, user, workspace);
    },
  }),

  defineTool({
    name: 'get_task_options',
    title: 'Get task options',
    description:
      'Values to choose from when editing a task: priorities, areas and ' +
      'people in charge in use, and the workspace members with the value ' +
      'that stands for each of them.',
    inputSchema: z.object({ space_id: spaceId }),
    write: false,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskBoardDto, { spaceId: args.space_id });
      return ctx.taskBoard.getFieldOptions(dto.spaceId, user, workspace);
    },
  }),

  defineTool({
    name: 'get_task_settings',
    title: 'Get task settings',
    description:
      'Get the label vocabulary of the workspace: the label prefix of each ' +
      'task field, the label values of each status and the priorities, ' +
      'most urgent first.',
    inputSchema: z.object({}),
    write: false,
    handler: async (_args, ctx) =>
      ctx.taskSettings.get(ctx.principal.workspace.id),
  }),

  defineTool({
    name: 'create_task',
    title: 'Create task',
    description:
      'Create a task page in a column of the board of a space, next to the ' +
      'other tasks. Content is written in Markdown. Set priority, areas and ' +
      'people in charge with update_task.',
    inputSchema: z.object({
      space_id: spaceId,
      title: z.string().min(1).max(500).describe('Task title'),
      status: status.optional().describe('Column of the task (default "todo")'),
      markdown: z
        .string()
        .max(20000)
        .optional()
        .describe('Content of the task page in Markdown'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskCreateDto, {
        spaceId: args.space_id,
        title: args.title,
        status: args.status ?? 'todo',
        content: args.markdown,
      });
      return ctx.taskBoard.createTask(dto, user, workspace);
    },
  }),

  defineTool({
    name: 'update_task',
    title: 'Update task',
    description:
      'Change the status, priority, areas and/or people in charge of a ' +
      'task. Fields that are not passed stay as they are; areas and ' +
      'assignees replace the current lists.',
    inputSchema: z.object({
      page_id: pageId,
      status: status.optional().describe('New column of the task'),
      priority: labelValue
        .nullable()
        .optional()
        .describe('New priority, or null to remove it'),
      areas: z
        .array(labelValue)
        .max(10)
        .optional()
        .describe('Areas of the task; an empty list removes them'),
      assignees: z
        .array(labelValue)
        .max(20)
        .optional()
        .describe(
          `People in charge; an empty list removes them. ${valueDescription} ` +
            'get_task_options lists the members with their value.',
        ),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const hasFields =
        args.priority !== undefined ||
        args.areas !== undefined ||
        args.assignees !== undefined;
      if (args.status === undefined && !hasFields) {
        throw new BadRequestException(
          'Nothing to update: pass status, priority, areas or assignees',
        );
      }
      const { user, workspace } = ctx.principal;
      const statusDto =
        args.status !== undefined
          ? await toDto(IdqTaskSetStatusDto, {
              pageId: args.page_id,
              status: args.status,
            })
          : null;
      const fieldsDto = hasFields
        ? await toDto(IdqTaskSetFieldsDto, {
            pageId: args.page_id,
            priority: args.priority,
            areas: args.areas,
            assignees: args.assignees,
          })
        : null;

      if (statusDto) {
        await ctx.taskBoard.setStatus(
          statusDto.pageId,
          statusDto.status,
          user,
          workspace,
        );
      }
      if (fieldsDto) {
        await ctx.taskBoard.setFields(
          fieldsDto.pageId,
          fieldsDto,
          user,
          workspace,
        );
      }
      return ctx.taskBoard.getPageInfo(args.page_id, user, workspace);
    },
  }),

  defineTool({
    name: 'add_task_link',
    title: 'Add task link',
    description:
      'Link a material to a task: a page of any space (target_page_id), a ' +
      'file attached to a page (attachment_id, see search_attachments) or ' +
      'an external http(s) link (url).',
    inputSchema: z.object({
      page_id: pageId.describe('Task page ID (UUID) or slug ID'),
      type: z.enum(['page', 'attachment', 'url']).describe('Kind of material'),
      target_page_id: pageId
        .optional()
        .describe('Page to link, for type "page"'),
      attachment_id: z
        .string()
        .uuid()
        .optional()
        .describe('Attachment to link, for type "attachment"'),
      url: z
        .string()
        .max(2000)
        .optional()
        .describe('http(s) address, for type "url"'),
      title: z
        .string()
        .max(255)
        .optional()
        .describe('Text shown for a "url" link (default: the address)'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const { taskPageId, ...input } = await toDto(IdqTaskAddLinkDto, {
        taskPageId: args.page_id,
        type: args.type,
        targetPageId: args.target_page_id,
        attachmentId: args.attachment_id,
        url: args.url,
        title: args.title,
      });
      return ctx.taskBoard.addLink(taskPageId, input, user, workspace);
    },
  }),

  defineTool({
    name: 'remove_task_link',
    title: 'Remove task link',
    description:
      'Remove a linked material from a task. The linked page or file itself ' +
      'is not deleted.',
    inputSchema: z.object({
      link_id: z
        .string()
        .uuid()
        .describe('Link ID, from the links of get_task'),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskLinkIdDto, { linkId: args.link_id });
      await ctx.taskLinks.remove(dto.linkId, user, workspace.id);
      return { linkId: dto.linkId, removed: true };
    },
  }),

  defineTool({
    name: 'list_assignee_mappings',
    title: 'List assignee mappings',
    description:
      'List the person-in-charge values in use and the member each one ' +
      'stands for: the one chosen by an admin (user), or else the one ' +
      'matched by name or email (automatic). Workspace admins only.',
    inputSchema: z.object({}),
    write: false,
    handler: async (_args, ctx) => {
      const { user, workspace } = ctx.principal;
      const vocabulary = await ctx.taskSettings.vocabulary(workspace.id);
      const used = await ctx.taskBoard.usedValues(
        user,
        workspace.id,
        vocabulary,
      );
      return {
        items: await ctx.taskAssignees.listMappings(
          user,
          workspace,
          used.assignee,
        ),
      };
    },
  }),

  defineTool({
    name: 'set_assignee_mapping',
    title: 'Set assignee mapping',
    description:
      'Link a person-in-charge value to a workspace member, or remove the ' +
      'link (user_id null) to go back to matching by name. Workspace admins ' +
      'only.',
    inputSchema: z.object({
      value: labelValue.describe(`Person-in-charge value. ${valueDescription}`),
      user_id: z
        .string()
        .uuid()
        .nullable()
        .describe('Member the value stands for, or null to remove the link'),
    }),
    write: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskAssigneeDto, {
        value: args.value,
        userId: args.user_id,
      });
      const userId = dto.userId ?? null;
      await ctx.taskAssignees.setMapping(dto.value, userId, user, workspace);
      return { value: dto.value, userId };
    },
  }),

  defineTool({
    name: 'update_task_settings',
    title: 'Update task settings',
    description:
      'Replace the label vocabulary of the workspace. Pass the whole ' +
      'vocabulary, as returned by get_task_settings. Labels already on ' +
      'pages are not renamed: tasks whose labels are no longer in the ' +
      'vocabulary leave the board. Workspace admins only.',
    inputSchema: z.object({
      vocabulary: z
        .object({
          prefixes: z
            .record(z.string(), z.string())
            .describe(
              'Label prefix of each field: status, priority, area, assignee',
            ),
          statuses: z
            .record(z.string(), z.array(z.string()))
            .describe(
              'Label values of each status, after the prefix. The first is ' +
                'written when a task moves; the others are also read.',
            ),
          priorities: z
            .array(z.string())
            .describe('Priority values, most urgent first'),
        })
        .describe('The vocabulary, as in get_task_settings'),
    }),
    write: true,
    destructive: true,
    handler: async (args, ctx) => {
      const { user, workspace } = ctx.principal;
      const dto = await toDto(IdqTaskSettingsDto, {
        vocabulary: args.vocabulary,
      });
      return ctx.taskSettings.update(dto.vocabulary, user, workspace);
    },
  }),
];
