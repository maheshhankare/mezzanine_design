# Security

## 1. What cannot be protected in a browser application

Anything the browser must run, it can read. For this reason the engine was moved to the server. What remains true:

* **The user interface code** (React components, the input schema with labels, limits, defaults and help texts, unit tables) is downloaded by the browser and can be saved, copied and inspected (DevTools, "Save page as" from the menu, `curl`). It contains no calculation code, no secrets and no database access. `npm run test:bundle` checks this on every build.
* **Ctrl+S interception is a deterrent only.** The page's script cancels the browser's Save shortcut and saves project data instead, but a user can still use the browser menu, DevTools, print-to-file or a download tool to obtain the *UI files*. Disabling right-click, shortcuts, printing or DevTools does not give complete protection and is not claimed.
* **Results are, by definition, delivered to the user.** An authenticated user can call the calculation service repeatedly and observe how outputs depend on inputs. Account creation is administrator-only and the service is rate limited, but this black-box sampling cannot be prevented entirely.
* **Check detail.** To preserve the original tool's traceability (clause, equation text, inputs, intermediate values of every check), the calculation service returns this detail to the signed-in user. It is text describing the checks, not the implementation. If it must be hidden, set `DISCLOSE_CHECK_DETAIL=false`: equations, factors, inputs and intermediate steps are then removed from every API response (the UI shows less per check). The PDF never contains them regardless of this setting.

## 2. Repository exposure (action required)

At the time of writing the GitHub repository `maheshhankare/mezzanine_design` is **public**, and its history contains the original `index.html` (the complete engine) and the first React port with `src/engine`. Moving the code to a server does not help while the repository is public.

1. Make the repository **private** (GitHub → Settings → General → Danger Zone → Change visibility).
2. Anyone who already cloned or forked it keeps a copy; this cannot be undone. If that matters, treat the formulas as disclosed.
3. Optionally remove the old files from history (`git filter-repo --path index.html --path src/engine --invert-paths`) before sharing the repository more widely.
4. Rotate the Neon database password: it was pasted into a chat during development. Update `DATABASE_URL` in Vercel afterwards.

## 3. Security checklist

| Item | Status |
|---|---|
| Server-side authentication (salted scrypt, signed `HttpOnly` cookie, 8 h expiry, logout) | done |
| Administrator-managed accounts; disable / reset ends sessions immediately | done |
| Project-level access control (owner / editor / viewer); other users get 404 | done |
| Server-side validation of every input; unknown keys rejected | done |
| Optimistic concurrency (revision) so updates never silently overwrite | done |
| Calculation engine only on the server (`server-only`), not in the browser bundle | done, verified by `test:bundle` |
| Database credentials and secrets only in server environment variables | done, verified by `test:bundle` |
| Cross-site request check (Origin) on all state-changing routes; `SameSite=Lax` | done |
| Login throttling (database-backed); rate limiting of calculation, drawing, report, optimiser routes | done (calculation limits are per server instance) |
| Security headers: CSP, HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | done |
| No source maps published; no `X-Powered-By` | done |
| Ctrl+S / Ctrl+Shift+S does not save the page; saves project data and confirms only after the server confirms | done |
| No UI option to download application source; export contains data only | done |
| Printing the screen is replaced by a notice; PDF is the report | done (CSS reviewed, not print-previewed) |
| PDF contains no HTML, scripts, credentials, equations, intermediate steps or UI | done, checked in `test:api` |
| Failed database requests give a clear message and are never reported as saved | done |
| Audit log of sign-ins, saves, deletes, reports, administration | done (no viewer UI yet) |
| Repository private | **to do (section 2)** |
| Database password rotated | **to do (section 2)** |
| Database backups | provider feature: see `docs/DEPLOY.md` |
| Two-factor authentication, e-mail password reset, idle timeout | not implemented |

## 4. Test results

Run on 2026-10-20 against a development server and the production build (`next start`), real Neon database.

**API (`npm run test:api`): 53 checks, all passed**, in both modes. They cover: anonymous requests to calculation / projects / admin / pages are refused or redirected to `/login`; foreign-Origin login refused; wrong password refused; login / logout; weak password refused; non-admin refused on admin routes; calculation with defaults; unknown or object-valued inputs refused; project create / list / open / update (same record, revision 1 → 2) / stale update refused (409) / out-of-range input refused (422 with field list) / delete; another user gets 404 on open, update, delete and report; sharing as viewer allows opening but not updating or deleting; malformed id gives 404; PDF is a real PDF and carries no HTML, script or credential markers; export has data and no source; drawings and DXF download; optimiser panel and event endpoints; disabled users lose their session at once and cannot sign in; repeated failed sign-ins are throttled (429).

**Browser bundle (`npm run test:bundle`): 34 checks, all passed**: none of 25 engine identifiers / clause texts and none of 8 secret markers in the files the browser downloads; no source maps.

**Parity with the original tool**: the rendered text of all 13 tabs (inputs, results, summary, optimisation panel, drawings) is character-for-character identical to the original `index.html` for the default project, with calculation performed on the server. The server self-test reproduces the 6 recorded reference cases (relative tolerance 1e-6). `npm run test:engine` reports the same FAIL / REVIEW counts as the original (15 / 0 for the default inputs).

**Browser UI** (Chromium, via the embedded browser): sign-in, redirect of unauthenticated visitors, Ctrl+S (no Save dialog; saved to the database; message only after the server answered), save refused with a visible field list for invalid values (and not reported as saved), update to revision 2 without a duplicate, reload restores the saved inputs, PDF download, optimisation search with live progress, apply / revert / save-as-new-project through the dialog protocol, display-unit switching, project details dialog, strict CSP in the production build.

**Not tested here**: Microsoft Edge, Firefox, Safari (only Chromium was available); an actual browser print preview; deployment on Vercel (not yet deployed).

## 5. Remaining limitations

1. UI code and the input schema are public (section 1); the repository is currently public (section 2).
2. Results and (by default) the check detail text reach authenticated users; black-box sampling of the engine is possible.
3. Rate limiting of calculation routes is in memory per serverless instance (best effort); login throttling is in the database.
4. Optimisation searches run in one request: Vercel limits the duration by plan (the route asks for 300 s; the Hobby plan caps lower). Long "whole system" searches may be cut off on small plans. **Cancel discards the search result** (the original returned the best candidate found so far).
5. The cross-browser self-test of the original no longer applies (the engine does not run in browsers); it is now a server-side self-test.
6. Engineering reference data (grades, bolt classes, partial factors) is still in code under version control, not in an audited database table.
7. The PDF has no sketches; drawings are available as DXF / SVG in the Drawings tab.
8. Ctrl+P prints a notice instead of the screen; the PDF is the printable report.
9. Sessions have a fixed 8-hour lifetime, no idle timeout, no 2FA, no self-service password reset (administrators reset passwords).
10. Project sharing is by e-mail of an existing user; there is no UI for the audit log.
