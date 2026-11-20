// After a failed submit the visitor needs to land ON the first problem, not just near it.
//
// The forms already scrolled the first errored field into view, but keyboard focus stayed on the submit button at the bottom of
// a long form — a keyboard or screen-reader user had to Shift+Tab backwards through every field to find what to fix (the
// message itself is announced through its role="alert", but nothing says where it belongs). This also moves focus to that
// field's first control. `preventScroll` because the smooth scroll above already brings it into view.
//
// `key` is the form-error key; each form wraps the field in an element with id `field-<key>`.
export function focusFieldError(key: string): void {
  const wrapper = document.getElementById(`field-${key}`);
  if (!wrapper) return;
  wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
  // Inputs, selects and textareas first: a field can carry a helper button in its label row (the departure field's "Use my location"), which comes
  // earlier in the document than the input but is not what needs fixing. Fields made only of a button (the date pickers) fall back to it.
  const control = wrapper.matches("input, select, textarea, button")
    ? wrapper
    : (wrapper.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea") ?? wrapper.querySelector<HTMLElement>("button"));
  control?.focus({ preventScroll: true });
}
