export interface ValidationIssue {
  code: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  stats: {
    unitCount: number;
    lessonCount: number;
    estimatedTotalMinutes: number;
  };
}

interface ValLesson {
  id: string;
  unitId: string;
  title: string;
  learningObjective: string;
  estimatedMinutes: number;
  difficulty: number;
  order: number;
  prerequisiteIds: string[];
  keyIdeas: string[];
  status: string;
  generatedLessonId?: string;
}

interface ValUnit {
  id: string;
  title: string;
  order: number;
  lessons: ValLesson[];
}

export interface ValidatableRoadmap {
  title: string;
  topic: string;
  goal: string;
  units: ValUnit[];
}

const COMPLETED = 'completed';
const ENTRY_STATUSES = new Set(['available', 'active']);
const MAX_REASONABLE_MINUTES = 240;

/** Validates a nested roadmap's curriculum structure and returns errors/warnings/stats. */
export function validateCurriculum(
  roadmap: ValidatableRoadmap,
  existingLessonIds: ReadonlySet<string> = new Set(),
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const err = (code: string, message: string, entityType?: string, entityId?: string) =>
    errors.push({ code, message, entityType, entityId });
  const warn = (code: string, message: string, entityType?: string, entityId?: string) =>
    warnings.push({ code, message, entityType, entityId });

  if (!roadmap.title?.trim()) err('MISSING_ROADMAP_FIELD', 'Roadmap title is required.', 'roadmap');
  if (!roadmap.topic?.trim()) err('MISSING_ROADMAP_FIELD', 'Roadmap topic is required.', 'roadmap');
  if (!roadmap.goal?.trim()) err('MISSING_ROADMAP_FIELD', 'Roadmap goal is required.', 'roadmap');

  const units = [...roadmap.units].sort((a, b) => a.order - b.order);
  if (units.length === 0) err('NO_UNITS', 'Roadmap must have at least one unit.', 'roadmap');

  const allLessons: ValLesson[] = [];
  const globalPosition = new Map<string, number>();
  let position = 0;

  const seenUnitOrders = new Set<number>();
  for (const unit of units) {
    if (seenUnitOrders.has(unit.order)) {
      warn('UNIT_ORDER_INVALID', `Duplicate unit order ${unit.order}.`, 'unit', unit.id);
    }
    seenUnitOrders.add(unit.order);

    const lessons = [...unit.lessons].sort((a, b) => a.order - b.order);
    const seenLessonOrders = new Set<number>();
    for (const lesson of lessons) {
      if (seenLessonOrders.has(lesson.order)) {
        warn('LESSON_ORDER_INVALID', `Duplicate lesson order ${lesson.order} in unit.`, 'unit', unit.id);
      }
      seenLessonOrders.add(lesson.order);
      globalPosition.set(lesson.id, position++);
      allLessons.push(lesson);
    }
  }

  if (allLessons.length === 0) err('NO_LESSONS', 'Roadmap must have at least one lesson.', 'roadmap');

  const idCounts = new Map<string, number>();
  for (const lesson of allLessons) {
    idCounts.set(lesson.id, (idCounts.get(lesson.id) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) err('DUPLICATE_LESSON_ID', `Lesson id "${id}" is used ${count} times.`, 'lesson', id);
  }

  const lessonIds = new Set(allLessons.map((l) => l.id));

  for (const lesson of allLessons) {
    if (!lesson.learningObjective?.trim()) {
      err('MISSING_OBJECTIVE', `Lesson "${lesson.title}" has no learning objective.`, 'lesson', lesson.id);
    }
    if (!Array.isArray(lesson.keyIdeas) || lesson.keyIdeas.length === 0) {
      err('EMPTY_KEY_IDEAS', `Lesson "${lesson.title}" has no key ideas.`, 'lesson', lesson.id);
    }
    if (typeof lesson.difficulty !== 'number' || lesson.difficulty < 1 || lesson.difficulty > 5) {
      err('DIFFICULTY_OUT_OF_RANGE', `Lesson "${lesson.title}" difficulty must be 1-5.`, 'lesson', lesson.id);
    }
    if (typeof lesson.estimatedMinutes !== 'number' || lesson.estimatedMinutes <= 0) {
      err('INVALID_MINUTES', `Lesson "${lesson.title}" needs positive estimated minutes.`, 'lesson', lesson.id);
    } else if (lesson.estimatedMinutes > MAX_REASONABLE_MINUTES) {
      warn('UNREASONABLE_MINUTES', `Lesson "${lesson.title}" is ${lesson.estimatedMinutes} min (unusually long).`, 'lesson', lesson.id);
    }

    const lessonPos = globalPosition.get(lesson.id) ?? 0;
    for (const prereq of lesson.prerequisiteIds ?? []) {
      if (!lessonIds.has(prereq)) {
        err('PREREQ_NOT_FOUND', `Lesson "${lesson.title}" references missing prerequisite "${prereq}".`, 'lesson', lesson.id);
        continue;
      }
      const prereqPos = globalPosition.get(prereq) ?? 0;
      if (prereqPos >= lessonPos) {
        err('FORWARD_PREREQ', `Lesson "${lesson.title}" depends on a later/equal lesson "${prereq}".`, 'lesson', lesson.id);
      }
    }

    if (lesson.generatedLessonId && !existingLessonIds.has(lesson.generatedLessonId)) {
      err('BROKEN_LESSON_LINK', `Lesson "${lesson.title}" links to missing generated lesson "${lesson.generatedLessonId}".`, 'lesson', lesson.id);
    }
  }

  // Cycle detection over prerequisite edges (prereq -> dependent).
  detectCycles(allLessons, lessonIds).forEach((id) =>
    err('PREREQ_CYCLE', `Lesson "${id}" participates in a prerequisite cycle.`, 'lesson', id),
  );

  if (allLessons.length > 0) {
    const allCompleted = allLessons.every((l) => l.status === COMPLETED);
    const hasEntry = allLessons.some((l) => ENTRY_STATUSES.has(l.status));
    if (!allCompleted && !hasEntry) {
      warn('NO_ENTRY_POINT', 'No lesson is available or active; learners have no starting point.', 'roadmap');
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      unitCount: units.length,
      lessonCount: allLessons.length,
      estimatedTotalMinutes: allLessons.reduce((sum, l) => sum + (l.estimatedMinutes || 0), 0),
    },
  };
}

/** Returns lesson ids that participate in any prerequisite cycle. */
function detectCycles(lessons: ValLesson[], lessonIds: ReadonlySet<string>): string[] {
  const adjacency = new Map<string, string[]>();
  for (const lesson of lessons) {
    const deps = (lesson.prerequisiteIds ?? []).filter((p) => lessonIds.has(p));
    adjacency.set(lesson.id, deps);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const inCycle = new Set<string>();

  const visit = (node: string, stack: string[]): void => {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of adjacency.get(node) ?? []) {
      const c = color.get(next) ?? WHITE;
      if (c === GRAY) {
        const idx = stack.indexOf(next);
        stack.slice(idx).forEach((n) => inCycle.add(n));
      } else if (c === WHITE) {
        visit(next, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  };

  for (const lesson of lessons) {
    if ((color.get(lesson.id) ?? WHITE) === WHITE) visit(lesson.id, []);
  }
  return [...inCycle];
}
