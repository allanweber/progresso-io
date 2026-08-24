import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  id: string;
  /** Field-level validation message, shown under the input. */
  error?: string;
};

/** Label + input pair used across the auth forms, with an inline error slot. */
export function Field({ label, id, error, ...inputProps }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...inputProps}
      />
      {error && (
        <p id={`${id}-error`} className="text-body-dense text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
