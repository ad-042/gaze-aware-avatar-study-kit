"""Session-scoped study assignment generation and storage."""

from __future__ import annotations

import logging
import random

from app.schemas.study import (
    AssignmentRound,
    ResolvedStudyAssignment,
    StudyConfig,
)

logger = logging.getLogger(__name__)

# In-memory assignment storage: session_id -> assignment
_assignments: dict[str, ResolvedStudyAssignment] = {}


def get_assignment(session_id: str) -> ResolvedStudyAssignment | None:
    """Return the stored assignment for a session, or None."""
    return _assignments.get(session_id)


def create_assignment(
    session_id: str,
    config: StudyConfig,
) -> ResolvedStudyAssignment:
    """Generate and store a session-scoped assignment. Idempotent."""
    existing = _assignments.get(session_id)
    if existing is not None:
        return existing

    seed = random.randint(0, 2**31 - 1)
    rng = random.Random(seed)

    meta = config.meta
    policy = meta.assignment

    # 1. Determine condition order
    if policy.condition_order_mode == "fixed":
        # fixed_condition_order is guaranteed present by StudyMeta validation
        assert policy.fixed_condition_order is not None
        conditions = list(policy.fixed_condition_order)
    elif policy.condition_order_mode == "counterbalanced":
        conditions = list(meta.conditions)
        rotate = seed % len(conditions)
        conditions = conditions[rotate:] + conditions[:rotate]
    elif policy.condition_order_mode == "random":
        conditions = list(meta.conditions)
        rng.shuffle(conditions)

    # 2. Build question pool (optionally shuffled)
    all_questions = list(config.prompts.quiz.questions)
    qpc = meta.questions_per_condition

    if policy.question_order_mode == "shuffle":
        rng.shuffle(all_questions)

    # 3. Identify conversation step IDs from flow (in order)
    conv_steps = [s for s in config.flow.steps if s.type == "conversation"]

    # 4. Build rounds — one per condition, bound to conversation step IDs
    rounds: list[AssignmentRound] = []
    q_offset = 0
    for i, cond in enumerate(conditions):
        step_id = conv_steps[i].id if i < len(conv_steps) else f"round_{i}"
        selected = all_questions[q_offset : q_offset + qpc]
        q_offset += qpc
        rounds.append(
            AssignmentRound(
                round_index=i,
                step_id=step_id,
                condition=cond,
                question_ids=[q.id for q in selected],
                questions=[q.text for q in selected],
            )
        )

    assignment = ResolvedStudyAssignment(
        session_id=session_id,
        study_id=config.meta.id,
        seed=seed,
        condition_order=conditions,
        rounds=rounds,
        questions_per_condition=qpc,
    )

    _assignments[session_id] = assignment
    logger.info(
        "Created assignment for session %s: seed=%d, order=%s",
        session_id,
        seed,
        conditions,
    )
    return assignment


def get_round_for_step(
    session_id: str,
    step_id: str,
) -> AssignmentRound | None:
    """Look up the assigned round for a specific conversation step."""
    assignment = _assignments.get(session_id)
    if assignment is None:
        return None
    for r in assignment.rounds:
        if r.step_id == step_id:
            return r
    return None
