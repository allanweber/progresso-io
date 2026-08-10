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
          <legend className="font-heading text-base font-semibold text-foreground">
            {section.title}
          </legend>
          <div className="space-y-4">
            {section.questions.map((q) => {
              const value = answers[q.key];
              const err = errors?.[q.key];
              const errorSlot = err ? (
                <p className="text-[13px] text-destructive">{err}</p>
              ) : null;

              if (q.type === "boolean") {
                const bool = value === true ? true : value === false ? false : null;
                return (
                  <div key={q.key} className="space-y-1.5">
                    <Label>{q.label}</Label>
                    <div className="flex gap-2">
                      {(
                        [
                          { label: "Sim", v: true },
                          { label: "Não", v: false },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.label}
                          type="button"
                          aria-pressed={bool === opt.v}
                          onClick={() => onAnswer(q.key, bool === opt.v ? null : opt.v)}
                          className={cn(
                            "rounded-[10px] border-[1.5px] px-4 py-2 text-sm font-medium transition-colors",
                            bool === opt.v
                              ? "border-primary bg-primary-light text-primary"
                              : "border-input text-[#334155] hover:bg-secondary",
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
                    <Label htmlFor={`q-${q.key}`}>{q.label}</Label>
                    <Textarea
                      id={`q-${q.key}`}
                      rows={3}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onAnswer(q.key, e.target.value)}
                    />
                    {errorSlot}
                  </div>
                );
              }
              return (
                <div key={q.key} className="space-y-1.5">
                  <Label htmlFor={`q-${q.key}`}>{q.label}</Label>
                  <Input
                    id={`q-${q.key}`}
                    value={typeof value === "string" ? value : ""}
                    placeholder={maskPlaceholder(q)}
                    inputMode={maskInputMode(q)}
                    aria-invalid={err ? true : undefined}
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
