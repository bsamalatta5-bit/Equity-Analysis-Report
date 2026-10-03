/** A12.7: list views show only the last 4 digits; detail views render the contact's phoneE164 as-is. */
export function maskPhoneE164(phoneE164: string): string {
  const visibleDigits = 4;
  if (phoneE164.length <= visibleDigits) {
    return phoneE164;
  }
  const visible = phoneE164.slice(-visibleDigits);
  return `${"•".repeat(phoneE164.length - visibleDigits)}${visible}`;
}
