import type { Questionnaire, QuestionnaireItem } from "../../shared/types.js";

export type QuestionnaireAnswers = Record<string, string | number>;

export interface QuestionnaireResult {
  questionnaire_id: string;
  answers: QuestionnaireAnswers;
}

/**
 * Renders a questionnaire into a container and collects answers.
 * Supports item types: likert, choice, text.
 */
export function renderQuestionnaire(
  container: HTMLElement,
  questionnaireId: string,
  questionnaire: Questionnaire,
  onSubmit: (result: QuestionnaireResult) => void,
  titleOverride?: string,
): void {
  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = titleOverride ?? questionnaire.title;
  container.appendChild(heading);

  if (questionnaire.instruction) {
    const instruction = document.createElement("p");
    instruction.className = "study-instruction";
    instruction.textContent = questionnaire.instruction;
    container.appendChild(instruction);
  }

  const form = document.createElement("form");
  form.className = "study-questionnaire";

  let i = 0;
  while (i < questionnaire.items.length) {
    const item = questionnaire.items[i];

    if (item.type === "likert") {
      const group = [item];
      while (i + 1 < questionnaire.items.length) {
        const next = questionnaire.items[i + 1];
        if (next.type === "likert" && sameScale(item, next)) {
          group.push(next);
          i++;
        } else break;
      }
      if (group.length >= 2) {
        renderLikertMatrix(form, group);
      } else {
        appendFieldset(form, item);
      }
    } else {
      appendFieldset(form, item);
    }
    i++;
  }

  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "study-btn";
  submitBtn.textContent = "Continue";
  form.appendChild(submitBtn);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const answers = collectAnswers(form, questionnaire.items);
    if (answers === null) return;
    onSubmit({ questionnaire_id: questionnaireId, answers });
  });

  container.appendChild(form);
}

function appendFieldset(
  form: HTMLElement,
  item: QuestionnaireItem,
): void {
  const fieldset = document.createElement("fieldset");
  fieldset.className = `study-item study-item--${item.type}`;

  const legend = document.createElement("legend");
  legend.textContent = item.text;
  if (item.required) {
    const req = document.createElement("span");
    req.className = "study-required";
    req.textContent = " *";
    legend.appendChild(req);
  }
  fieldset.appendChild(legend);

  switch (item.type) {
    case "likert":
      renderLikertRow(fieldset, item);
      break;
    case "choice":
      renderChoice(fieldset, item);
      break;
    case "text":
      renderText(fieldset, item);
      break;
  }
  form.appendChild(fieldset);
}

function sameScale(a: QuestionnaireItem, b: QuestionnaireItem): boolean {
  return (
    (a.scale_min ?? 1) === (b.scale_min ?? 1) &&
    (a.scale_max ?? 5) === (b.scale_max ?? 5) &&
    JSON.stringify(a.scale_labels ?? []) ===
      JSON.stringify(b.scale_labels ?? [])
  );
}

function renderLikertMatrix(
  container: HTMLElement,
  items: QuestionnaireItem[],
): void {
  const min = items[0].scale_min ?? 1;
  const max = items[0].scale_max ?? 5;
  const labels = items[0].scale_labels ?? [];

  const table = document.createElement("table");
  table.className = "study-likert-matrix";

  // Header row with scale labels
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const emptyTh = document.createElement("th");
  headerRow.appendChild(emptyTh);

  for (let i = min; i <= max; i++) {
    const th = document.createElement("th");
    th.textContent = labels[i - min] ?? String(i);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);

  // One row per item
  const tbody = document.createElement("tbody");
  for (const item of items) {
    const tr = document.createElement("tr");

    const labelTd = document.createElement("td");
    labelTd.className = "study-likert-matrix-label";
    labelTd.textContent = item.text;
    if (item.required) {
      const req = document.createElement("span");
      req.className = "study-required";
      req.textContent = " *";
      labelTd.appendChild(req);
    }
    tr.appendChild(labelTd);

    for (let i = min; i <= max; i++) {
      const td = document.createElement("td");
      td.dataset.label = labels[i - min] ?? String(i);
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = item.id;
      radio.value = String(i);
      if (item.required) radio.required = true;
      td.appendChild(radio);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);
}

/** Single standalone likert item (horizontal row) */
function renderLikertRow(fieldset: HTMLElement, item: QuestionnaireItem): void {
  const min = item.scale_min ?? 1;
  const max = item.scale_max ?? 5;
  const labels = item.scale_labels ?? [];

  const group = document.createElement("div");
  group.className = "study-likert-group";

  for (let i = min; i <= max; i++) {
    const label = document.createElement("label");
    label.className = "study-likert-option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = item.id;
    radio.value = String(i);
    if (item.required) radio.required = true;

    const text = document.createElement("span");
    text.textContent = labels[i - min] ?? String(i);

    label.appendChild(radio);
    label.appendChild(text);
    group.appendChild(label);
  }

  fieldset.appendChild(group);
}

function renderChoice(fieldset: HTMLElement, item: QuestionnaireItem): void {
  const options = item.options ?? [];

  const group = document.createElement("div");
  group.className = "study-choice-group";

  for (const option of options) {
    const label = document.createElement("label");
    label.className = "study-choice-option";

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = item.id;
    radio.value = option;
    if (item.required) radio.required = true;

    const text = document.createElement("span");
    text.textContent = option;

    label.appendChild(radio);
    label.appendChild(text);
    group.appendChild(label);
  }

  fieldset.appendChild(group);
}

function renderText(fieldset: HTMLElement, item: QuestionnaireItem): void {
  const textarea = document.createElement("textarea");
  textarea.name = item.id;
  textarea.className = "study-textarea";
  textarea.rows = 4;
  if (item.required) textarea.required = true;
  fieldset.appendChild(textarea);
}

function collectAnswers(
  form: HTMLFormElement,
  items: QuestionnaireItem[],
): QuestionnaireAnswers | null {
  const data = new FormData(form);
  const answers: QuestionnaireAnswers = {};

  for (const item of items) {
    const value = data.get(item.id);
    if (item.required && (value === null || value === "")) {
      return null;
    }
    if (value !== null && value !== "") {
      answers[item.id] =
        item.type === "likert" ? Number(value) : String(value);
    }
  }

  return answers;
}
