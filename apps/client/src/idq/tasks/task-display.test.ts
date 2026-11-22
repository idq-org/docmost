import { describe, expect, it } from "vitest";
import {
  compareTasks,
  formatFileSize,
  isOverdue,
  labelValueText,
  priorityRank,
} from "./task-display";
import { applyFilters, NO_FILTERS } from "./task-filtering";
import type { IBoardTask } from "./types";

const task = (pageId: string, extra: Partial<IBoardTask> = {}): IBoardTask => ({
  pageId,
  slugId: pageId,
  title: pageId,
  icon: null,
  status: "todo",
  statusValue: "todo",
  priority: null,
  areas: [],
  assignees: [],
  nextDeadline: null,
  linkCount: 0,
  canEdit: true,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  ...extra,
});

const priorities = ["massima", "alta", "media"];

describe("priorityRank", () => {
  it("puts vocabulary values first, unknown ones after, no priority last", () => {
    expect(priorityRank("massima", priorities)).toBe(0);
    expect(priorityRank("media", priorities)).toBe(2);
    expect(priorityRank("other", priorities)).toBe(3);
    expect(priorityRank(null, priorities)).toBe(4);
  });
});

describe("compareTasks", () => {
  it("orders by priority, then deadline (none last), then title", () => {
    const tasks = [
      task("b", { priority: "alta" }),
      task("a", { priority: "alta" }),
      task("late", {
        priority: "alta",
        nextDeadline: {
          dueAt: "2026-12-10T10:00:00Z",
          allDay: false,
          title: null,
        },
      }),
      task("soon", {
        priority: "alta",
        nextDeadline: {
          dueAt: "2026-12-01T10:00:00Z",
          allDay: false,
          title: null,
        },
      }),
      task("none"),
      task("top", { priority: "massima" }),
    ];
    expect(tasks.sort(compareTasks(priorities)).map((t) => t.pageId)).toEqual([
      "top",
      "soon",
      "late",
      "a",
      "b",
      "none",
    ]);
  });
});

describe("isOverdue", () => {
  const now = new Date(2026, 10, 22, 15, 0);

  it("counts an all-day deadline until the end of its day", () => {
    const today = new Date(2026, 10, 22, 0, 0).toISOString();
    expect(isOverdue({ dueAt: today, allDay: true, title: null }, now)).toBe(
      false,
    );
    expect(isOverdue({ dueAt: today, allDay: false, title: null }, now)).toBe(
      true,
    );
  });

  it("is false without a deadline", () => {
    expect(isOverdue(null, now)).toBe(false);
  });
});

describe("labelValueText", () => {
  it("turns a label value into text", () => {
    expect(labelValueText("teacher-training")).toBe("Teacher training");
    expect(labelValueText("polaris_plus~2026")).toBe("Polaris plus 2026");
  });
});

describe("formatFileSize", () => {
  it("uses the largest unit below 1024", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(20 * 1024 * 1024)).toBe("20 MB");
  });
});

describe("applyFilters", () => {
  const me = { id: "u1", name: "Me", avatarUrl: null };
  const tasks = [
    task("mine", {
      priority: "alta",
      areas: ["scuole"],
      assignees: [{ value: "me", name: "Me", user: me as any }],
    }),
    task("other", {
      areas: ["social"],
      assignees: [{ value: "ada", name: "Ada", user: null }],
    }),
  ];
  const ids = (list: IBoardTask[]) => list.map((t) => t.pageId);

  it("keeps everything without filters", () => {
    expect(ids(applyFilters(tasks, NO_FILTERS, "u1"))).toEqual([
      "mine",
      "other",
    ]);
  });

  it("combines priority, area, person in charge and My tasks", () => {
    expect(
      ids(applyFilters(tasks, { ...NO_FILTERS, priority: "alta" }, "u1")),
    ).toEqual(["mine"]);
    expect(
      ids(applyFilters(tasks, { ...NO_FILTERS, area: "social" }, "u1")),
    ).toEqual(["other"]);
    expect(
      ids(applyFilters(tasks, { ...NO_FILTERS, assignee: "ada" }, "u1")),
    ).toEqual(["other"]);
    expect(
      ids(applyFilters(tasks, { ...NO_FILTERS, mine: true }, "u1")),
    ).toEqual(["mine"]);
    expect(
      ids(applyFilters(tasks, { ...NO_FILTERS, mine: true }, undefined)),
    ).toEqual([]);
  });
});
