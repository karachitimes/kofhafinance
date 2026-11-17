# State machines in the KoFHA dashboard

Every part of the page that can be "in a state" is listed here. The ones marked **machine** use `machine()` from `js/fsm.js`. Their current state is always on the `<html>` element (`data-screen`, `data-busy`, `data-notice`, `data-bankmatch`, `data-ask`, `data-tab`). `window.KOFHA.snapshot()` returns all of them plus the period, bank and open report in one object.

For people and AI agents checking the page: read `document.documentElement.dataset` or call `KOFHA.snapshot()`. `KOFHA.log` holds the last 100 transitions. A line with `to: null` is an event the state did not allow (it was ignored).

## Machines

| Name (`data-*`) | File | States | Events | Why it is a machine |
|---|---|---|---|---|
| `screen` | core.js | boot, setup, public, gate, app | NEED_KEY, KEY_SAVED, PUBLIC, SIGN_IN, SIGNED_IN | Four screens were shown and hidden by hand in 6 places, so two could be visible at once. Leaving the dashboard also clears the busy overlay. |
| `busy` | core.js | idle, busy | START, DONE | The overlay was a true/false switch. When two loads ran together (figures and then the open report), the first to finish hid it while the second was still loading. It now counts open requests. |
| `notice` | core.js, pwa.js | hidden, offline, offline_copy, update | OFFLINE, ONLINE, CACHED, UPDATE | The bottom bar. Coming back online used to hide a "new version ready" offer. The update offer now stays until Reload. |
| `bankmatch` | reports.js | idle, running, failed, done | RUNNING, FAILED, DONE, IDLE | Mirrors the server job (`bank_match_status`). The button is disabled while running. |
| `ask` | ask.js | idle, waiting, answered, failed, stopped | ASK, ANSWER, FAIL, STOP, RESET | Ask KoFHA. Only the newest question moves it. |
| `tab` | overview.js | page id | `showTab()` | Plain attribute (not a machine): which page is open. |

## Latest request wins (`latest` in fsm.js)

Used by the Transactions list (`txn`) and the Report library (`report`). It already existed for the figures (`reqNo`) and Ask (`askSeq`). If an older, slower answer comes back after a newer one was asked for, it is dropped instead of overwriting the table.

## Left as they are (simple, one place, no bug found)

- Login button disabled while signing in (core.js).
- Proposal Confirm / Reject buttons per row (reports.js).
- Report maker mode (make / formats / saved), period preset (month / custom), pager offsets, drawer open/closed, filter bar shown/hidden, Install button.

Convert one of these only when it gains a third state or a second place that changes it.

## How it was chosen

These open-source libraries were compared:

| Project | Idea taken | Why not used as is |
|---|---|---|
| [XState](https://github.com/statelyai/xstate) | Transition table, events by name, state visible to tools | Large for a page of plain scripts with no build step. |
| [robot](https://github.com/matthewp/robot) | About 1 kB; a machine is just a table of states and transitions | ES modules only; our scripts are classic `<script>` tags. |
| [zag-js](https://github.com/chakra-ui/zag) | State written to `data-*` attributes for CSS and tests | Built for UI widgets on top of a framework. |
| [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/guides/queries) | Request status kept apart from "is fetching"; offline means "paused", not "error" | React/Vue library. The offline copies in `OFF` already cover the paused case. |

So `fsm.js` is about 40 lines that follow the robot/XState table format. Unknown events never throw (so nothing breaks), and every machine shows its state as a zag-style `data-*` attribute.

## Tests

`node --test tests/fsm.test.js` (Node 18+, nothing to install).
