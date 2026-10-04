import { AlertCircle } from "lucide-react";

// The one inline field-error presentation used by every form. An icon plus
// text, so the error never relies on colour alone, and role="alert" so a
// screen reader announces it when it appears. Pass `id` and point the
// field's aria-describedby at it so the error is read together with the
// field it belongs to.
export function FieldError({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-700">
      <AlertCircle size={14} strokeWidth={2.25} aria-hidden="true" className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
