# Web Components Craft — reference

Deep detail for each rule in `SKILL.md`. Read the section you need; you do not
need the whole file at once.

## 1. Define an element

```js
class MyCard extends HTMLElement {
  constructor() {
    super(); // always first; do no DOM work that depends on children here
  }
}
customElements.define("my-card", MyCard);
```

Rules the browser enforces:

- The tag name must contain a hyphen and start with a lowercase letter.
- You may not extend a built-in tag name. Customized built-ins
  (`extends HTMLButtonElement`, `is="..."`) have no Safari support — avoid them;
  wrap or compose instead.
- `customElements.define` may be called only once per name. A second call throws.

To act only after the definition exists:

```js
await customElements.whenDefined("my-card");
```

## 2. Lifecycle

| Callback | Runs when | Use for |
|---|---|---|
| `constructor` | element is created | shadow root, internals, one-time field setup |
| `connectedCallback` | inserted into the DOM | add listeners, start work, render |
| `disconnectedCallback` | removed from the DOM | remove every listener / observer / timer |
| `attributeChangedCallback(name, old, new)` | an observed attribute changes | react to configuration |
| `adoptedCallback` | moved to a new document | rare; re-wire document-scoped things |

`observedAttributes` is a static getter. Only the attributes it lists trigger
`attributeChangedCallback`:

```js
static observedAttributes = ["value", "disabled"];
```

Guard connect/disconnect correctly:

```js
connectedCallback() {
  // connectedCallback can fire more than once in an element's life.
  if (!this.#ready) {
    this.#render();      // first-time setup
    this.#ready = true;
  }
  this.#controller = new AbortController();
  this.addEventListener("click", this.#onClick, { signal: this.#controller.signal });
}

disconnectedCallback() {
  this.#controller?.abort(); // removes every listener bound to this signal at once
}
```

Using one `AbortController` per connection and passing its `signal` to every
`addEventListener` means one `abort()` tears them all down. This is the
simplest leak-proof pattern.

## 3. Shadow DOM

```js
const root = this.attachShadow({ mode: "open", delegatesFocus: true });
```

- `mode: "open"` exposes `el.shadowRoot`; `"closed"` hides it. Open is normal;
  closed does not give real security and complicates testing.
- `delegatesFocus: true` moves focus to the first focusable inner node when the
  host is focused — important for form controls.

Slots project light-DOM children into the shadow tree:

```html
<template>
  <style>::slotted(h2) { margin: 0; }</style>
  <slot name="title"></slot>
  <slot></slot> <!-- default slot -->
</template>
```

Styling hooks:

- `:host` — the element itself. `:host([disabled])` — when it has that attribute.
- `::part(name)` — expose an inner node (`part="foo"`) for the page to style.
- `::slotted(sel)` — style projected light-DOM nodes (top level only).

React to slot changes with the `slotchange` event.

## 4. Templates

Define markup once, clone per instance:

```js
const template = document.createElement("template");
template.innerHTML = `<p class="label"></p>`;

// per instance:
root.append(template.content.cloneNode(true));
```

`template.content` is an inert `DocumentFragment`: scripts do not run and images
do not load until it is cloned into the live tree. Build the string once at
module scope, never inside the constructor.

## 5. Attributes vs properties

- **Attributes** are strings in HTML. Good for simple configuration you want
  visible in markup and in devtools.
- **Properties** are JS values. The only way to pass an object, array, or
  function.

Reflect a simple attribute without an infinite loop:

```js
get value() { return Number(this.getAttribute("value")) || 0; }
set value(v) {
  const n = Number(v) || 0;
  // guard: only touch the attribute if it actually differs
  if (n !== this.value) this.setAttribute("value", String(n));
}

attributeChangedCallback(name, _old, now) {
  if (name === "value") this.#render(); // do not write the attribute back here
}
```

The guard in the setter plus "never write the observed attribute from inside
its own `attributeChangedCallback`" is what stops the setter ↔ callback loop.

## 6. Events

```js
this.dispatchEvent(new CustomEvent("change", {
  detail: { value: this.value },
  bubbles: true,   // travels up the tree
  composed: true,  // crosses the shadow boundary to the outside page
}));
```

A non-`composed` event stops at the shadow root and the outside page never sees
it. Default custom events are neither bubbling nor composed, so set both when
you want the component's user to listen on the host or an ancestor.

## 7. Styling with shared stylesheets

```js
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host { display: inline-block; }
  :host([hidden]) { display: none; }
`);

// in the constructor, after attachShadow:
root.adoptedStyleSheets = [sheet];
```

One `CSSStyleSheet` built at module scope is parsed once and shared by every
instance. This beats a `<style>` tag per element, which re-parses for each one.
`adoptedStyleSheets` is an array — you can combine a shared base sheet with an
instance-specific one.

## 8. Accessibility and form association

A control that submits with a form and carries its own semantics:

```js
class StarRating extends HTMLElement {
  static formAssociated = true; // opt in to form participation

  #internals;
  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#internals.role = "slider";        // host gets the role, not a wrapper
    this.#internals.ariaValueMin = "0";
  }

  set value(v) {
    this.#internals.setFormValue(String(v));  // value travels with the form
    this.#internals.ariaValueNow = String(v);
  }
}
```

Form-associated lifecycle callbacks you may also implement:
`formAssociatedCallback`, `formDisabledCallback`, `formResetCallback`,
`formStateRestoreCallback`.

Non-negotiable regardless of form status:

- Accessible name — from `aria-label`, a projected label, or `internals.ariaLabel`.
- Visible focus — never remove the outline without replacing it.
- Keyboard — every pointer action has a key equivalent.

## 9. Progressive enhancement and SSR

Put meaningful content in the light DOM so the element degrades to plain HTML:

```html
<star-rating value="3">Rated 3 out of 5</star-rating>
```

For server rendering before the script loads, use Declarative Shadow DOM:

```html
<my-card>
  <template shadowrootmode="open">
    <style>/* ... */</style>
    <slot></slot>
  </template>
  <h2>Visible immediately</h2>
</my-card>
```

The browser attaches the shadow root during parsing — no flash of unstyled
content while JavaScript downloads.

## 11. Security patterns (the core selling point)

### Fail-secure default

A safety-controlling attribute defaults to the strictest value, and is fixed
once connected:

```js
static observedAttributes = ["level"];
#level = "critical"; // strictest by default

attributeChangedCallback(name, _old, now) {
  if (name === "level") {
    if (this.isConnected) return;              // immutable after connect
    this.#level = LEVELS.has(now) ? now : "critical"; // invalid -> strictest
  }
}
```

### Build DOM without strings of user data

```js
// NEVER: user value interpolated into HTML
el.innerHTML = `<span>${userValue}</span>`; // XSS (OWASP A03)

// ALWAYS: element + textContent
const span = document.createElement("span");
span.textContent = userValue; // the browser escapes it for you
el.append(span);
```

A fixed, author-written template string (no interpolation) is safe. The rule is
about *user data*, never about `<template>` literals you wrote.

### Keep secrets out of events

```js
// composed events cross the shadow boundary — any page script can listen.
this.dispatchEvent(new CustomEvent("change", {
  detail: { name: this.name, type: "secure-input" }, // no value, no token
  bubbles: true,
  composed: true,
}));
// the caller reads the value directly: (e.target).value
```

### Closed Shadow DOM for sensitive internals

```js
#root; // private: the page cannot reach it via el.shadowRoot
constructor() {
  super();
  this.#root = this.attachShadow({ mode: "closed" });
}
```

Use closed for password / token / payment controls. Use open for a plain widget
where encapsulation is about style, not secrecy. State the choice.

### CSP-safe styling

A constructable stylesheet is exempt from `style-src 'unsafe-inline'`, so it
works under a strict policy:

```js
const sheet = new CSSStyleSheet();
sheet.replaceSync(`:host { display: inline-block; }`); // author CSS, no user data
root.adoptedStyleSheets = [sheet];
```

Never build a `<style>` element or a `style="..."` attribute from a user value.
If you need a dynamic value, pass it as a CSS custom property set with
`el.style.setProperty("--x", CSS.escape(value))`, never as raw CSS text.

### Escape selectors and allowlist URLs

```js
const field = root.querySelector(`[name="${CSS.escape(name)}"]`); // selector injection
```

```js
function safeUrl(raw) {
  const u = new URL(raw, location.origin);
  const sameOrigin = u.origin === location.origin;
  const httpish = u.protocol === "https:" || u.protocol === "http:";
  if (!sameOrigin || !httpish) throw new Error("rejected url");
  return u.href; // OWASP A10 (SSRF)
}
```

### Signed envelope (tamper-evidence, not proof)

`SubtleCrypto` is native — no crypto library needed:

```js
const key = await crypto.subtle.importKey(
  "raw", rawKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
```

The signature proves the payload was not altered in transit by a passive party.
It is **not** cryptographic proof of origin — the key lives in client JS memory
and same-page XSS can read it. Rotate it per session from a server nonce.

### The honesty rule

Every client-side "security" control gets a one-line comment naming its ceiling
and the server-side control that actually enforces it:

```js
// UX early-warning only. Real XSS prevention = server-side output encoding
// + strict CSP (script-src 'self', no unsafe-inline). An attacker who posts
// with fetch/curl bypasses this entirely.
```

Collapsing "we scan on the client" into "we are safe" is the lie this skill
exists to prevent.

## 10. Common failures (audit targets)

- Listeners added in `connectedCallback` and never removed → memory leak and
  double handlers after re-insertion.
- First-time render repeated on every reconnection → wasted work, lost state.
- An attribute read in `attributeChangedCallback` that is not in
  `observedAttributes` → the callback never fires.
- Setter writes the attribute, `attributeChangedCallback` writes the property →
  infinite loop or a thrown stack overflow.
- `CustomEvent` without `composed: true` inside a shadow tree → the page's
  listener never hears it.
- Removed focus outline with no replacement → keyboard users are lost.
- `innerHTML` built from untrusted input → XSS. Build DOM nodes or sanitize;
  never interpolate user strings into an HTML string.
