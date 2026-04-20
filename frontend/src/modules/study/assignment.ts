/**
 * Session-scoped study assignment: local generation (demo) and backend fetch (full local).
 *
 * The assignment determines condition order and question assignment per round,
 * without mutating the static StudyConfig.
 */

import type {
  StudyConfig,
  ResolvedStudyAssignment,
  AssignmentRound,
} from "../../shared/types.js";
import { parseAssignment } from "../../shared/apiParse.js";
import { apiBase } from "../../shared/apiBase.js";

// --- Seeded PRNG (mulberry32) ---

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- Local assignment generation (demo mode) ---

export function generateLocalAssignment(
  config: StudyConfig,
  sessionId: string,
): ResolvedStudyAssignment {
  const seed = (Math.random() * 2 ** 31) | 0;
  const rng = mulberry32(seed);

  const meta = config.meta;
  const policy = meta.assignment;

  // 1. Condition order
  let conditions: string[];
  if (policy.condition_order_mode === "fixed") {
    // fixed_condition_order is guaranteed present by validation / parseStudyConfig
    conditions = [...(policy.fixed_condition_order!)];
  } else if (policy.condition_order_mode === "counterbalanced") {
    conditions = [...meta.conditions];
    const rotate = ((seed % conditions.length) + conditions.length) % conditions.length;
    conditions = [...conditions.slice(rotate), ...conditions.slice(0, rotate)];
  } else {
    // "random"
    conditions = seededShuffle(meta.conditions, rng);
  }

  // 2. Question pool
  const allQuestions = [...config.prompts.quiz.questions];
  const qpc = meta.questions_per_condition;
  const pool = policy.question_order_mode === "shuffle"
    ? seededShuffle(allQuestions, rng)
    : allQuestions;

  // 3. Conversation step IDs
  const convSteps = config.flow.steps.filter((s) => s.type === "conversation");

  // 4. Build rounds
  const rounds: AssignmentRound[] = [];
  let qOffset = 0;
  for (let i = 0; i < conditions.length; i++) {
    const stepId = i < convSteps.length ? convSteps[i].id : `round_${i}`;
    const selected = pool.slice(qOffset, qOffset + qpc);
    qOffset += qpc;
    rounds.push({
      round_index: i,
      step_id: stepId,
      condition: conditions[i],
      question_ids: selected.map((q) => q.id),
      questions: selected.map((q) => q.text),
    });
  }

  return {
    session_id: sessionId,
    study_id: config.meta.id,
    seed,
    condition_order: conditions,
    rounds,
    questions_per_condition: qpc,
  };
}

// --- Backend fetch (full local mode) ---

export async function fetchAssignment(
  sessionId: string,
  studyId: string,
): Promise<ResolvedStudyAssignment> {
  const res = await fetch(`${apiBase()}/api/sessions/${encodeURIComponent(sessionId)}/assignment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ study_id: studyId }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create assignment: ${res.status}`);
  }
  return parseAssignment(await res.json());
}

// --- Helpers ---

export function getRoundForStep(
  assignment: ResolvedStudyAssignment,
  stepId: string,
): AssignmentRound | undefined {
  return assignment.rounds.find((r) => r.step_id === stepId);
}
