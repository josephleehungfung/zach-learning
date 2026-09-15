# Zach Daily Quest — implementation draft

Separate from the existing Math Quest at the repository root. This folder is prepared locally; it is not deployed and `config.js` deliberately has no live API URL.

## Implemented

- Eight daily tasks, English task cues and Traditional Chinese guidance.
- Parent password login and single-use 10-minute child pairing code; 30-day device sessions with revocation.
- Parent-only review, durable server-side coin balance, task submission and reward redemption.
- Same-day submissions are unique, approvals idempotent, balance changes serialized.
- Parent-configurable per-task coins and reward catalog; initial values are unset, with no fabricated reward rules.
- Submitted tasks retain their original coin amounts after settings change.
- Client polls every 15 seconds while visible; offline requests report failure, never simulate a successful save.
- Hong Kong calendar dates; pending prior-day submissions remain available to parents.

## Deployment still required

1. Connect GitHub with access to `josephleehungfung/zach-learning`, review/push this branch.
2. Deploy `api/worker.mjs` to a Cloudflare account with Durable Objects, using `api/wrangler.jsonc`. A cloud account and deployment authorization are required; no cloud resource has been created here.
3. Set the Worker secret `SETUP_KEY` securely. Do not commit it. Use a randomly generated long value.
4. Replace the empty `window.QUEST_API` in `config.js` with the Worker HTTPS origin; deploy static files via the existing GitHub Pages workflow.
5. Open `/zach-learning/life-quest/` on the parent's phone. Choose first-time account creation; set a 12+ character password and enter the deployment setup key. Set agreed task scores and reward prices.
6. Generate a pairing code and enter it on Zach's iPad using the same website.
7. Verify actual phone/iPad synchronization before marking the system live.

The GitHub Pages origin is allowlisted at the Worker, while all reads and writes require a valid family session. Public source contains no account passwords or activity data. The backend holds one private family, not a public multi-family service. Basic auth attempt throttling allows 12 attempts per 10 minutes per family; deployment-level abuse protection and secure account recovery are operational follow-ups before wider use.

## Rule limits

V1 supports per-task coins and parent-confirmed redemption. It does not yet implement daily thresholds, streak bonuses or penalties because the existing full rules have not been supplied. Do not present V1 as implementing those rules. The calm-at-school task uses positive action wording for the previously agreed emotional-control goal.

## Checks

`node --test life-quest/api/worker.test.mjs` tests two-device state, access restrictions, repeat submissions/approvals, insufficient balance, pairing revocation and preserved submission points using a storage mock. This is not a Cloudflare runtime or browser test. Before publication, validate with Wrangler and actual browser sessions, including iPad Safari.

Backend reference: https://developers.cloudflare.com/durable-objects/
