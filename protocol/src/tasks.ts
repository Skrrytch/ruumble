/**
 * Shared task lists (A2): detection and ticking, shared by service and web UI so that both see the same tasks.
 * Strict: a text post is a task list only if an optional introductory text is followed exclusively by task
 * lines (blank lines allowed). Anything else after the first task keeps the post ordinary Markdown.
 */

export interface TaskItem {
  /** position among the tasks, 0-based (what the web UI sends) */
  index: number;
  /** line in the text, 0-based (what the service changes) */
  line: number;
  done: boolean;
  text: string;
}

export interface TaskList {
  /** Markdown above the tasks, may be empty */
  intro: string;
  tasks: TaskItem[];
}

/** `[ ] Task`, `[] Task`, `- [ ] Task`, `* [x] Task`, `+ [X] Task`; the task needs text */
const TASK_LINE = /^\s*(?:[-*+]\s+)?\[([ xX]?)\]\s+(\S.*)$/;
/** anything that looks like a task, even without text: from the first such line on, only real tasks may follow */
const TASK_LIKE = /^\s*(?:[-*+]\s+)?\[[ xX]?\](\s|$)/;
const FENCE = /^\s*(```|~~~)/gm;

export function parseTaskList(text: string): TaskList | null {
  const lines = text.split("\n").map((l) => l.replace(/\r$/, ""));
  const first = lines.findIndex((l) => TASK_LIKE.test(l));
  if (first < 0) return null;
  const intro = lines.slice(0, first).join("\n");
  // an unclosed code block in the introduction: the "tasks" would be code
  if ((intro.match(FENCE) ?? []).length % 2 === 1) return null;
  const tasks: TaskItem[] = [];
  for (let i = first; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const m = TASK_LINE.exec(line);
    if (!m) return null;
    tasks.push({ index: tasks.length, line: i, done: m[1] === "x" || m[1] === "X", text: m[2]!.trim() });
  }
  return { intro: intro.trim(), tasks };
}

/** tick or untick task `index`: changes only the marker of that line; `null` if there is no such task */
export function setTask(text: string, index: number, done: boolean): string | null {
  const task = parseTaskList(text)?.tasks[index];
  if (!task) return null;
  const lines = text.split("\n");
  lines[task.line] = lines[task.line]!.replace(/\[[ xX]?\]/, done ? "[x]" : "[ ]");
  return lines.join("\n");
}
