# Myanmar Release QA

Run these checks before merge or immediately after deploy when a change touches Myanmar-facing copy.

## Automated guard

Run:

```bash
npm run test:myanmar-copy
npm run typecheck
npm run build
```

The Myanmar copy guard is scoped to the highest-traffic routes and Telegram surfaces that already had repeated mixed-language regressions.

## Web QA

Switch the UI locale to Myanmar and verify:

- `/dashboard/servers/[id]`
- `/dashboard/servers/deploy`
- `/dashboard/users`
- `/sub/[token]`
- dashboard sidebar/footer and role badges

Check for:

- mixed English labels in Burmese sentences
- clipped or wrapped buttons, badges, and tabs
- mobile scrolling issues and double-scroll containers
- stale toast copy after create, update, sync, or delete actions

## Telegram QA

Verify the Myanmar variants of:

- storefront `/buy` flow
- renew and order summary flow
- key list and key detail flow
- support and premium support flows
- admin key-management prompts and callback notices

Check for:

- mixed Burmese/English labels in buttons, cards, and prompts
- untranslated recovery, outage, refund, or support notices
- broken inline formatting after translation

## Allowed technical literals

These may stay in English when translation would be misleading or invalid:

- `Atomic-UI`
- `Outline`
- `Telegram`
- `API`, `URL`, `IP`, `SLA`, `CPU`, `QR`
- slash commands and machine tokens such as `/buy`, `segment=vip`, `region=sg`

If a production QA issue falls outside these allowed literals, open a follow-up patch instead of widening the allowlist blindly.
