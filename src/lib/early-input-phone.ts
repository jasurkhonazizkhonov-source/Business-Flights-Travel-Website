/**
 * A phone number typed into the server-rendered (plain) phone field before hydration. The rich phone input keeps an international number (+country code first), so only a
 * value that starts with "+" and contains nothing but digits and the usual separators is taken back, and it is normalised to "+digits". Anything else (a national number
 * without a country code, whose country is not known yet) is left for the visitor to enter again: guessing a country would risk a wrong number.
 */
export function adoptEarlyPhone(raw: string, setPhone: (value: string) => void): void {
  const text = raw.trim();
  if (!/^\+[\d\s().-]+$/.test(text)) return;
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 2) setPhone(`+${digits}`);
}
