# Notes

## Known cleanup (deferred)

- `Unit` model has two property references:
  - `propertyId` (ObjectId) — **authoritative**, all reads/writes use this
  - `property` (String) — legacy field, written but not read; kept as a safety net
- Removal plan was scoped as "E-5" during the migration. Deferred because
  it's cosmetic, not functional. Do it when: a second dev joins, or before
  any major schema work.

## Notifications

Currently placeholder. Real notifications (email/push) would need a provider
like Resend or Twilio. Not started.

## Password reset

Not implemented. Needed before onboarding real users who may forget passwords.

## Tests

32 tests in `tests/`. Run with `npm test`. Uses in-memory MongoDB —
never touches real data.
