"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";

import { signUpCoach, signInWithGoogle } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AuthDivider } from "@/components/auth/auth-divider";
import { Field } from "@/components/ui/field";
import { FormError } from "@/components/auth/form-error";
import { GoogleButton } from "@/components/auth/google-button";
import { StepIndicator } from "@/components/ui/step-indicator";
import { SubmitButton } from "@/components/ui/submit-button";
import { SIGNUP_PLANS } from "@/lib/plans";

type Account = { name: string; email: string; password: string };

const steps = ["Conta", "Plano", "Confirmar"] as const;

export function RegisterWizard() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState("solo");
  const [account, setAccount] = useState<Account>({
    name: "",
    email: "",
    password: "",
  });

  const next = () => setStep((s) => Math.min(s + 1, 3));
  const prev = () => setStep((s) => Math.max(s - 1, 1));

  return (
    <>
      <StepIndicator labels={steps} current={step} className="mb-9" />

      <div className="w-full max-w-[460px] rounded-2xl bg-white px-10 py-9 shadow-rest">
        {step === 1 && (
          <AccountStep
            account={account}
            onChange={setAccount}
            onContinue={next}
          />
        )}
        {step === 2 && (
          <PlanStep
            selected={plan}
            onSelect={setPlan}
            onBack={prev}
            onContinue={next}
          />
        )}
        {step === 3 && (
          <ConfirmStep account={account} plan={plan} onBack={prev} />
        )}
      </div>
    </>
  );
}

function AccountStep({
  account,
  onChange,
  onContinue,
}: {
  account: Account;
  onChange: (account: Account) => void;
  onContinue: () => void;
}) {
  const [error, setError] = useState<string>();

  function submit() {
    const valid =
      account.name.trim().length > 1 &&
      /.+@.+\..+/.test(account.email) &&
      account.password.length >= 8;
    if (!valid) {
      setError("Preencha nome, e-mail e uma senha de ao menos 8 caracteres.");
      return;
    }
    setError(undefined);
    onContinue();
  }

  return (
    // Not a <form> element: it contains the Google <form>, and forms can't nest.
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-[22px] font-bold text-foreground">
          Crie sua conta
        </h1>
        <p className="text-sm text-muted-foreground">
          14 dias grátis, sem cartão de crédito.
        </p>
      </div>

      <form action={signInWithGoogle}>
        <GoogleButton type="submit" label="Registrar com Google" className="mb-4" />
      </form>
      <div className="mb-5">
        <AuthDivider label="ou registre com e-mail" />
      </div>

      <div className="mb-6 space-y-3.5">
        <FormError message={error} />
        <Field
          id="name"
          label="Nome completo"
          placeholder="Thiago Corrêa"
          autoComplete="name"
          value={account.name}
          onChange={(e) => onChange({ ...account, name: e.target.value })}
        />
        <Field
          id="email"
          label="E-mail profissional"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          value={account.email}
          onChange={(e) => onChange({ ...account, email: e.target.value })}
        />
        <Field
          id="password"
          label="Senha"
          type="password"
          placeholder="mínimo 8 caracteres"
          autoComplete="new-password"
          value={account.password}
          onChange={(e) => onChange({ ...account, password: e.target.value })}
        />
      </div>

      <Button type="button" size="lg" className="w-full" onClick={submit}>
        Continuar
      </Button>
    </div>
  );
}

function PlanStep({
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  selected: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-[22px] font-bold text-foreground">
          Escolha seu plano
        </h1>
        <p className="text-sm text-muted-foreground">
          14 dias grátis em qualquer plano.
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3">
        {SIGNUP_PLANS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(option.id)}
              className={cn(
                "rounded-[10px] border-2 px-4 py-3.5 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary-light"
                  : "border-border bg-white hover:border-primary/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 font-heading text-subtitle font-bold text-foreground">
                    {option.name}
                    {option.popular && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-eyebrow font-bold text-white">
                        popular
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {option.desc}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-heading text-lg font-bold text-foreground">
                    {option.price}
                  </div>
                  <div className="text-caption text-meta">/mês</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2.5">
        <Button type="button" variant="secondary" onClick={onBack} className="flex-1">
          Voltar
        </Button>
        <Button type="button" onClick={onContinue} className="flex-[2]">
          Continuar
        </Button>
      </div>
    </div>
  );
}

function ConfirmStep({
  account,
  plan,
  onBack,
}: {
  account: Account;
  plan: string;
  onBack: () => void;
}) {
  const [state, formAction] = useActionState(signUpCoach, undefined);
  const planName = SIGNUP_PLANS.find((p) => p.id === plan)?.name ?? "Solo";
  // The account fields live on step 1, so any server error (e.g. e-mail already
  // in use) is shown here as a banner rather than under an off-screen input.
  const banner =
    state?.formError ??
    (state?.fieldErrors ? Object.values(state.fieldErrors)[0] : undefined);

  return (
    <form action={formAction} className="px-2 py-2 text-center">
      <input type="hidden" name="name" value={account.name} />
      <input type="hidden" name="email" value={account.email} />
      <input type="hidden" name="password" value={account.password} />
      <input type="hidden" name="plan" value={plan} />

      <div className="mx-auto mb-4 flex size-[60px] items-center justify-center rounded-full bg-[#DCFCE7]">
        <Check className="size-7 text-primary" strokeWidth={2.5} />
      </div>
      <h1 className="mb-1.5 font-heading text-[22px] font-bold text-foreground">
        Tudo pronto para começar
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Plano <strong className="text-foreground">{planName}</strong> · trial de
        14 dias. Vamos criar sua conta e enviar um código para{" "}
        <strong className="text-foreground">{account.email || "seu e-mail"}</strong>.
      </p>

      <div className="mb-4 text-left">
        <FormError message={banner} />
      </div>

      <SubmitButton size="lg" className="w-full" pendingLabel="Criando conta…">
        Criar conta →
      </SubmitButton>
      <button
        type="button"
        onClick={onBack}
        className="mt-3 w-full text-body-dense text-muted-foreground hover:text-foreground"
      >
        Voltar
      </button>
    </form>
  );
}
