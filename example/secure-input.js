// secure-input.js — a worked, security-first Web Component.
//
// It shows every rule from SKILL.md on a real form field:
//   - fail-secure default: an unknown/absent `tier` lands on the strictest tier
//   - DOM built with createElement + textContent, never innerHTML (no XSS)
//   - injection scan as an early-warning UX control (honest about its ceiling)
//   - no value / no secret in composed events — only { name, tier }
//   - masking for non-public tiers, never mirrored into a light-DOM hidden input
//   - form participation + validity via ElementInternals
//   - closed Shadow DOM (sensitive internals), leak-free listeners
//   - themeable via custom properties + ::part(), accessible by default
//
// Usage:
//   <secure-text-input name="email" label="Email" tier="public"></secure-text-input>
//   <secure-text-input name="password" label="Password" tier="sensitive"></secure-text-input>
//
// Theme it from the page (no need to touch this file):
//   secure-text-input { --secure-input-accent: #0969da; --secure-input-radius: 8px; }
//   secure-text-input::part(input) { font-size: 1.1rem; }

const TIERS = new Set(["public", "sensitive", "critical"]);

// Early-warning patterns only. NOT an XSS filter — see the honesty note below.
const INJECTION = [
  { id: "script-tag", re: /<\s*script/i },
  { id: "js-uri", re: /javascript:/i },
  { id: "event-handler", re: /\son\w+\s*=/i },
  { id: "template-injection", re: /\{\{.*\}\}/ },
];

function detectInjection(value) {
  for (const p of INJECTION) if (p.re.test(value)) return p.id;
  return null;
}

const sheet = new CSSStyleSheet();
// Every visible value is a custom property with a fallback, so the page can
// theme the field without reaching into the closed shadow root.
sheet.replaceSync(`
  :host {
    display: block;
    font: inherit;
    --_border: var(--secure-input-border, #8c959f);
    --_accent: var(--secure-input-accent, #0969da);
    --_invalid: var(--secure-input-invalid, #cf222e);
  }
  :host([disabled]) { opacity: var(--secure-input-disabled-opacity, .5); }
  .label {
    display: block;
    margin-block-end: .35em;
    font-size: var(--secure-input-label-size, .9rem);
    color: var(--secure-input-label-color, #1f2328);
  }
  .input {
    inline-size: 100%;
    box-sizing: border-box;
    padding: var(--secure-input-padding, .55em .7em);
    font: inherit;
    color: inherit;
    border: 1px solid var(--_border);
    border-radius: var(--secure-input-radius, 6px);
    background: var(--secure-input-bg, canvas);
  }
  .input:focus-visible {
    outline: 2px solid var(--_accent);
    outline-offset: 1px;
    border-color: var(--_accent);
  }
  :host([data-state="blocked"]) .input { border-color: var(--_invalid); }
  .error {
    margin-block-start: .35em;
    font-size: var(--secure-input-error-size, .85rem);
    color: var(--_invalid);
  }
  .error[hidden] { display: none; }
`);

let uid = 0;

class SecureTextInput extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["tier", "disabled"];

  #internals;
  #root;
  #input;
  #error;
  #tier = "critical"; // fail-secure: strictest until a valid tier is read
  #controller;
  #ready = false;

  constructor() {
    super();
    this.#internals = this.attachInternals();
    // Closed root: a page script cannot walk into a field that may hold a secret.
    this.#root = this.attachShadow({ mode: "closed", delegatesFocus: true });
    this.#root.adoptedStyleSheets = [sheet];
  }

  get name() {
    return this.getAttribute("name") ?? "";
  }

  // Read the current value from the control. The value is never reflected back
  // to an attribute (that would leak a secret into the DOM) and never rides in
  // an event.
  get value() {
    return this.#input ? this.#input.value : "";
  }

  connectedCallback() {
    if (!this.#ready) {
      // tier is read once and then immutable (see attributeChangedCallback).
      const t = this.getAttribute("tier");
      this.#tier = TIERS.has(t) ? t : "critical";
      this.#render();
      this.#ready = true;
    }
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    this.#input.addEventListener("input", this.#onInput, { signal });
  }

  disconnectedCallback() {
    this.#controller?.abort();
  }

  attributeChangedCallback(name, _old, now) {
    if (name === "tier" && this.#ready) {
      // Immutable after connect: a security tier must not be downgraded at runtime.
      console.warn("secure-text-input: tier is immutable after connect; ignored.");
      return;
    }
    if (name === "disabled" && this.#input) {
      this.#input.disabled = this.hasAttribute("disabled");
    }
  }

  #render() {
    const id = `sti-${++uid}`;
    const label = document.createElement("label");
    label.className = "label";
    label.setAttribute("part", "label");
    label.htmlFor = id;
    label.textContent = this.getAttribute("label") ?? this.name; // author text, set safely

    const input = document.createElement("input");
    input.className = "input";
    input.setAttribute("part", "input");
    input.id = id;
    // Non-public tiers are masked. autocomplete off keeps secrets out of stores.
    input.type = this.#tier === "public" ? "text" : "password";
    if (this.#tier !== "public") input.autocomplete = "off";
    input.disabled = this.hasAttribute("disabled");
    const initial = this.getAttribute("value");
    if (initial) input.value = initial;

    const error = document.createElement("p");
    error.className = "error";
    error.setAttribute("part", "error");
    error.id = `${id}-err`;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    error.hidden = true;

    input.setAttribute("aria-describedby", error.id);

    this.#root.replaceChildren(label, input, error);
    this.#input = input;
    this.#error = error;
    if (initial) this.#internals.setFormValue(initial);
  }

  #onInput = () => {
    const v = this.#input.value;
    const hit = detectInjection(v);
    if (hit) {
      this.#block(hit);
      return;
    }
    this.#clearError();
    this.#internals.setFormValue(v);
    this.dispatchEvent(new CustomEvent("secure-input-change", {
      // No value, no secret — a page listener gets only identity + tier.
      detail: { name: this.name, tier: this.#tier },
      bubbles: true,
      composed: true,
    }));
  };

  #block(patternId) {
    // UX early-warning only. Real XSS prevention = server-side output encoding
    // + a strict CSP (script-src 'self', no unsafe-inline). An attacker who
    // posts with fetch/curl bypasses this entirely — never rely on it alone.
    this.#internals.setFormValue(""); // do not submit a flagged value
    this.#internals.setValidity({ customError: true },
      "Input blocked: potential injection pattern.", this.#input);
    this.#showError("Input blocked: potential injection pattern.");
    this.setAttribute("data-state", "blocked");
    this.dispatchEvent(new CustomEvent("secure-threat-detected", {
      detail: { name: this.name, patternId }, // never the raw value
      bubbles: true,
      composed: true,
    }));
  }

  #showError(msg) {
    this.#error.textContent = msg;
    this.#error.hidden = false;
    this.#input.setAttribute("aria-invalid", "true");
  }

  #clearError() {
    this.#error.hidden = true;
    this.#error.textContent = "";
    this.#input.removeAttribute("aria-invalid");
    this.#internals.setValidity({});
    this.removeAttribute("data-state");
  }

  formResetCallback() {
    if (this.#input) this.#input.value = "";
    this.#clearError();
    this.#internals.setFormValue("");
  }
}

customElements.define("secure-text-input", SecureTextInput);
