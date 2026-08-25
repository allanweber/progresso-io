"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  maskInputMode,
  maskPlaceholder,
  type AnamnesisSection,
} from "@/lib/anamneses";
import type { AnamnesisAnswers, AnamnesisAnswerValue } from "@/lib/student-anamneses";

/**
 * The controlled questionnaire form — a flat tree of sections → questions with a
 * per-type input (short text, long text, Sim/Não). Short-text questions may
 * carry an input mask (date / number / pressure) that hints the placeholder and
 * keyboard; validation errors are passed in via `errors` and shown per field.
 * Presentational and reused by both the coach fill page and the public (aluno)
 * fill page; each parent owns the `<form>`, the submit button and any extra
 * fields (e.g. the WhatsApp confirm). Answers are keyed by question key.
 *
 * Every question renders an element at `#q-<key>`, whatever its type — the
 * parent's scroll-to-first-error relies on that being true for the Sim/Não
 * group as much as for a text input.
 */
export function AnamnesisFillForm({
  sections,
  answers,
  onAnswer,
  disabled,
  errors,
}: {
  sections: AnamnesisSection[];
  answers: AnamnesisAnswers;
  onAnswer: (key: string, value: AnamnesisAnswerValue) => void;
  disabled?: boolean;
  errors?: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <fieldset key={section.key} className="space-y-4" disabled={disabled}>
          <legend className="font-heading text-subtitle font-semibold text-foreground">
            {section.title}
          </legend>
          <div className="space-y-4">
            {section.questions.map((q) => {
              const err = errors?.[q.key];
              const value = answers[q.key];
              const fieldId = `q-${q.key}`;
              const errorId = `${fieldId}-error`;
              // Wired to the control via aria-describedby, so a screen reader
              // reads the problem with the field rather than orphaning it.
              const errorSlot = err ? (
                <p id={errorId} className="text-body-dense text-destructive">
                  {err}
                </p>
              ) : null;

              if (q.type === "boolean") {
                const bool = value === true ? true : value === false ? false : null;
                const labelId = `${fieldId}-label`;
                return (
                  <div key={q.key} className="space-y-1.5">
                    {/* A choice of two, announced as one group with one name —
                        not as two unrelated toggles beside orphaned text. */}
                    <span id={labelId} className="block text-label font-semibold text-foreground">
                      {q.label}
                    </span>
                    <div
                      id={fieldId}
                      role="radiogroup"
                      // Focusable only programmatically, so the parent's
                      // scroll-to-first-error can land on it.
                      tabIndex={-1}
                      aria-labelledby={labelId}
                      aria-describedby={err ? errorId : undefined}
                      aria-invalid={err ? true : undefined}
                      className="flex gap-2"
                    >
                      {(
                        [
                          { label: "Sim", v: true },
                          { label: "Não", v: false },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          role="radio"
                          aria-checked={bool === opt.v}
                          onClick={() => onAnswer(q.key, bool === opt.v ? null : opt.v)}
                          className={cn(
                            "h-11 rounded-[10px] border-[1.5px] px-5 text-body font-medium transition-colors",
                            bool === opt.v
                              ? "border-primary bg-primary-light text-primary-deep"
                              : "border-input text-text-secondary hover:bg-secondary",
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {errorSlot}
                  </div>
                );
              }
              if (q.type === "long_text") {
                return (
                  <div key={q.key} className="space-y-1.5">
                    <Label htmlFor={fieldId}>{q.label}</Label>
                    <Textarea
                      id={fieldId}
                      rows={3}
                      value={typeof value === "string" ? value : ""}
                      aria-invalid={err ? true : undefined}
                      aria-describedby={err ? errorId : undefined}
                      onChange={(e) => onAnswer(q.key, e.target.value)}
                    />
                    {errorSlot}
                  </div>
                );
              }
              return (
                <div key={q.key} className="space-y-1.5">
                  <Label htmlFor={fieldId}>{q.label}</Label>
                  <Input
                    id={fieldId}
                    value={typeof value === "string" ? value : ""}
                    placeholder={maskPlaceholder(q)}
                    inputMode={maskInputMode(q)}
                    aria-invalid={err ? true : undefined}
                    aria-describedby={err ? errorId : undefined}
                    onChange={(e) => onAnswer(q.key, e.target.value)}
                  />
                  {errorSlot}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
