# Secure Web Components

**Security-first. Zero dependencies.** A skill that teaches an AI agent to build
and audit **native Web Components** the safe way — Custom Elements with no
framework, no runtime libraries, and secure defaults baked in.

No React, no Vue, no Svelte. No bundler-only tricks. Just the browser platform,
used correctly.

## Why this one

Most frontend skills chase React and Tailwind. This one owns the gap nobody else
covers: **plain Web Components that are safe by default.** It teaches the same
two principles a production security-first component library ships on —

1. **Zero dependencies.** Every library you skip is one less supply-chain hole
   (OWASP A06). The platform already has Custom Elements, Shadow DOM,
   `ElementInternals`, `SubtleCrypto`, and `MutationObserver`.
2. **Security by default.** Fail-secure defaults, DOM built without `innerHTML`,
   no secrets in events that cross the shadow boundary, closed Shadow DOM for
   sensitive internals, CSP-safe styling, and an honesty rule: a client-side
   check is early-warning, never a substitute for server-side enforcement.

## What it covers

- Fail-secure defaults and immutable safety attributes
- Building DOM with `createElement` + `textContent`, never user strings in HTML
- Keeping values and tokens out of `composed` events
- Closed vs open Shadow DOM — and when each is right
- CSP-safe styling with constructable stylesheets
- `CSS.escape` for selectors, URL allowlisting against SSRF
- Native `SubtleCrypto` signed envelopes (tamper-evidence, with honest limits)
- The full lifecycle and the leak-proof one-`AbortController` pattern
- `<template>` cloning, attribute/property reflection without loops
- Form participation with `ElementInternals`
- Accessibility: name, role, visible focus, keyboard operation
- Progressive enhancement and Declarative Shadow DOM
- An **audit mode** that reports pass / fail / could-not-tell against the eight
  most common Web Component security and correctness bugs

## The example

![The secure-text-input demo: a public email, a masked password, an injection
attempt being blocked, and events that never carry the value.](./secure-input-demo.gif)

`example/secure-input.js` is a working, form-associated, accessible
**security-first text field**: it masks non-public tiers, flags injection
patterns as an early warning, keeps the value out of events, submits via
`ElementInternals`, and is fully themeable. Open `example/index.html` in any
modern browser to try it — type `<script>` into a field to see the block.
No build, no server step needed.

## The reference implementation

These patterns come from a real, shipped library:
**[secure-ui-components](https://barryprender.github.io/Secure-UI/)** — a
security-first, zero-dependency Web Component library (secure input, form, file
upload, card, telemetry, and more). Want the patterns pre-built and tested?
Start there. This skill teaches your agent to write components in the same style.

## Install

Drop the folder into your agent's skills directory, or install it through the
marketplace you got it from. The skill triggers when your task involves a custom
element, Shadow DOM, a `<template>`, a form control, or a reusable UI primitive
without a framework.

## Standards

Built against the WHATWG HTML Living Standard, MDN, and the OWASP Top 10.
Accessibility target is WCAG 2.2 AA.

- https://html.spec.whatwg.org/multipage/custom-elements.html
- https://developer.mozilla.org/en-US/docs/Web/API/Web_components
- https://owasp.org/www-project-top-ten/

## License

MIT. See [LICENSE](./LICENSE).
