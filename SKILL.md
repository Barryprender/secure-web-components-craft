---
name: secure-web-components-craft
description: Build and audit native Web Components (Custom Elements) that are secure by default and have zero dependencies — no framework, no runtime libraries. Covers fail-secure defaults, DOM built without innerHTML, no secrets in composed events, CSP-safe styling, closed Shadow DOM for sensitive internals, lifecycle leak safety, form-association with ElementInternals, and progressive enhancement. Use whenever writing, reviewing, or refactoring a custom element, a Web Component, a `.js`/`.ts` file that calls `customElements.define`, Shadow DOM, a `<template>`, a form control, or a reusable UI primitive without React/Vue/Svelte.
license: MIT
allowed-tools: Read, Grep, Glob, Bash, Write, Edit
---

# Secure Web Components Craft

Native Custom Elements. **Secure by default. Zero dependencies.** Sources of truth:
https://html.spec.whatwg.org/multipage/custom-elements.html |
https://developer.mozilla.org/en-US/docs/Web/API/Web_components |
https://owasp.org/www-project-top-ten/

A project's own conventions win over this file. Read them first. Where the
project is silent, this is the standard.

## Zero dependencies

- **The platform is the toolkit.** Custom Elements, Shadow DOM, `<template>`,
  `ElementInternals`, `CustomEvent`, `adoptedStyleSheets`, `SubtleCrypto`,
  `MutationObserver` — all native. Reach for a library only after proving the
  platform cannot do it, and then justify it in one line.
- **No build step is required to run a component.** TypeScript compilation is
  the most a component may assume. No bundler-only syntax in source.
- Fewer dependencies is fewer supply-chain holes. Every one you skip is an
  OWASP A06 (vulnerable components) risk you never take on.

## Security by default

- **Fail secure.** When an attribute that controls safety is missing or invalid,
  stay in the *most* restrictive state, never the most permissive. A security
  level, once set at connect, is immutable — reject changes in
  `attributeChangedCallback`.
- **Never build DOM from strings of user data.** No `innerHTML`, no
  `insertAdjacentHTML`, no template-literal HTML with interpolated values. Build
  with `document.createElement` and set `.textContent`. A fixed, author-written
  template string is fine; a user value inside one is an XSS hole (OWASP A03).
- **Keep secrets out of events.** Events with `composed: true` cross the shadow
  boundary and any page script can hear them. A value, token, or card number
  must never ride in `CustomEvent.detail`. Put a name and a type there; let the
  caller read the value from the element directly.
- **Closed Shadow DOM for sensitive internals.** A control holding a password,
  token, or payment field uses `attachShadow({ mode: "closed" })` and keeps the
  root in a private field, so a page script cannot walk into it. An open root is
  fine for a plain, non-sensitive widget — choose on purpose.
- **CSP-safe styling.** Style with a constructable `CSSStyleSheet` via
  `adoptedStyleSheets`, or a `<link>` to `'self'`. Never inject a `<style>` built
  from a user value, and never set `style="..."` from user input. This keeps a
  strict policy (`style-src 'self'`, no `unsafe-inline`) intact.
- **Escape anything put in a selector.** A `name` or id used in
  `querySelector`/`querySelectorAll` goes through `CSS.escape()`.
- **Allowlist outbound URLs.** A `src`, `action`, or fetch target taken from an
  attribute is validated — same-origin or relative, `http(s)` only — before use
  (OWASP A10, SSRF).

## Know the ceiling — say it out loud

Client-side checks are **UX and early-warning only**. Injection scanning,
rate-limiting, and a signed envelope raise the cost of casual abuse; they do not
stop a determined attacker who posts with `fetch` or `curl`. State this where
you add such a check. Real protection is **server-side**: output encoding, a
strict Content Security Policy, server-side rate limits, and real authorization.
Never let a client control stand in for a server one.

## Prefer

- **`<template>` cloned**, not an HTML string, for repeated markup.
- **One shared `CSSStyleSheet`** over a `<style>` per instance.
- **Attributes for configuration, properties for rich data** — reflected without
  a setter ↔ `attributeChangedCallback` loop.
- **`ElementInternals`** for form participation (`formAssociated`,
  `setFormValue`) and for the host's default role / ARIA — so the host carries
  the semantics, not a hidden wrapper. For a masked value, do **not** mirror it
  into a light-DOM hidden input; that one `querySelector` defeats the masking.
- **One `AbortController` per connection**, its `signal` passed to every
  `addEventListener`, so one `abort()` in `disconnectedCallback` removes them all.
- **Declarative Shadow DOM** when the element must render before its script loads.

## Styling and theming

Shadow DOM blocks page CSS *by design* — that is the encapsulation that keeps a
component unbreakable, not a flaw. So expose styling through the three channels
that are meant to cross the boundary, and never make a consumer fork the file to
restyle it:

- **CSS custom properties with fallbacks** — `color: var(--x-color, #333)`.
  Custom properties pierce the shadow boundary, so a page sets `--x-color` and
  the component picks it up. Name them in one consistent namespace (a design-
  token prefix), and document every one.
- **`::part()`** — put `part="name"` on key internal elements so a page can style
  them structurally (`my-el::part(label)`). Expose parts deliberately; each one
  is a public API you must keep stable.
- **`:host` and `:host([state])`** — style the element itself and its states
  (`:host([disabled])`, `:host(:focus-visible)`) from inside.

Hard-coded colours and sizes with no custom property are the tell of a component
nobody can theme. A themeable component ships its defaults *as* fallbacks.

## Audit mode

Report pass / fail / could-not-tell for each, in order:

1. **Injection** — is any DOM built from a string containing user data?
2. **Leak** — is every listener / observer / timer from `connectedCallback` torn
   down in `disconnectedCallback`?
3. **Secret in event** — does any `composed` event carry a value, token, or
   other sensitive field in `detail`?
4. **Fail-open** — does a missing or invalid safety attribute land in a
   permissive state?
5. **Re-entry** — does `connectedCallback` survive running twice?
6. **A11y** — accessible name, role, visible focus, keyboard path?
7. **Reflection** — attribute and property in sync, no loop?
8. **Honesty** — is a client-side "security" control labelled as early-warning,
   with the server-side requirement named?

Full detail and copy-paste examples are in `reference.md`. A worked, accessible,
form-associated example — a security-first text field — is in
`example/secure-input.js`.

## Check before finishing

The smallest runnable check that fails if the component is wrong:

1. Add the element, remove it, add it again. No duplicate listeners, no errors.
2. Tab to it. Focus is visible. Operate it with the keyboard alone.
3. If form-associated, submit and confirm its value arrives.
4. Grep the source for `innerHTML`, `insertAdjacentHTML`, and `detail:` — each
   hit is justified or removed.
