// star-rating.js — a worked Web Component.
//
// It shows every rule from SKILL.md in one small, real control:
//   - shared stylesheet via adoptedStyleSheets (section 7)
//   - a <template> cloned per instance (section 4)
//   - value/max reflected without a setter<->callback loop (section 5)
//   - a composed "change" event (section 6)
//   - form participation + host role via ElementInternals (section 8)
//   - leak-free listeners torn down with one AbortController (section 2)
//   - full keyboard operation and visible focus (accessibility)
//   - themeable via custom properties + ::part(), no forking (section 12)
//
// Usage:
//   <label id="l">Rate this</label>
//   <star-rating max="5" value="3" aria-labelledby="l"></star-rating>
//
// Theme it from the page (no need to touch this file):
//   star-rating { --star-color: #d0d7de; --star-active-color: #e5534b;
//                  --star-size: 2.25rem; --star-gap: .25em; }
//   star-rating::part(star) { /* style each star */ }

const sheet = new CSSStyleSheet();
// Every visible value is a CSS custom property with a fallback. Custom
// properties pierce the shadow boundary, so a page can theme the component
// without reaching inside it — the only safe way to expose styling. The parts
// (part="stars", part="star") let a page target structure with ::part().
sheet.replaceSync(`
  :host {
    display: inline-flex;
    gap: var(--star-gap, .15em);
    font-size: var(--star-size, 1.75rem);
    line-height: 1;
    cursor: pointer;
    color: var(--star-color, #c9c9c9);
    outline: none;
  }
  :host(:focus-visible) {
    outline: var(--star-focus-outline, 2px solid currentColor);
    outline-offset: 3px;
    border-radius: 4px;
  }
  :host([disabled]) {
    cursor: not-allowed;
    opacity: var(--star-disabled-opacity, .5);
  }
  .star { transition: color 120ms ease; }
  .star[data-on] { color: var(--star-active-color, #f5a623); }
`);

const template = document.createElement("template");
template.innerHTML = `<span class="stars" part="stars"></span>`;

class StarRating extends HTMLElement {
  static formAssociated = true;
  static observedAttributes = ["value", "max", "disabled"];

  #internals;
  #stars;
  #controller;
  #ready = false;

  constructor() {
    super();
    this.#internals = this.attachInternals();
    this.#internals.role = "slider";
    // Open root is fine here: a rating has no secret internals. For a password,
    // token, or payment field use { mode: "closed" } and keep the root private.
    const root = this.attachShadow({ mode: "open" });
    root.adoptedStyleSheets = [sheet];
    root.append(template.content.cloneNode(true));
    this.#stars = root.querySelector(".stars");
  }

  // --- configuration as reflected attributes ---------------------------------

  get value() {
    return clamp(Number(this.getAttribute("value")) || 0, 0, this.max);
  }
  set value(v) {
    const n = clamp(Math.round(Number(v) || 0), 0, this.max);
    // Guard: only touch the attribute when it differs, so the setter and
    // attributeChangedCallback cannot loop into each other.
    if (n !== this.value) this.setAttribute("value", String(n));
  }

  get max() {
    return Math.max(1, Number(this.getAttribute("max")) || 5);
  }
  set max(v) {
    this.setAttribute("max", String(Math.max(1, Number(v) || 5)));
  }

  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(on) {
    this.toggleAttribute("disabled", Boolean(on));
  }

  // --- lifecycle -------------------------------------------------------------

  connectedCallback() {
    if (!this.#ready) {
      this.#render();
      this.#ready = true;
    }
    if (!this.hasAttribute("tabindex")) this.setAttribute("tabindex", "0");

    // One controller per connection; abort() in disconnect removes all of these
    // at once, so re-inserting the element can never stack duplicate listeners.
    this.#controller = new AbortController();
    const { signal } = this.#controller;
    this.addEventListener("keydown", this.#onKeydown, { signal });
    this.#stars.addEventListener("click", this.#onClick, { signal });
  }

  disconnectedCallback() {
    this.#controller?.abort();
  }

  attributeChangedCallback(name) {
    if (!this.#ready) return;
    if (name === "disabled") {
      this.setAttribute("tabindex", this.disabled ? "-1" : "0");
    }
    // Reflect state out to the form and assistive tech, then repaint.
    this.#sync();
    this.#render();
  }

  // --- behavior --------------------------------------------------------------

  #onClick = (event) => {
    if (this.disabled) return;
    const star = event.target.closest(".star");
    if (star) this.#commit(Number(star.dataset.index) + 1);
  };

  #onKeydown = (event) => {
    if (this.disabled) return;
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      this.#commit(this.value + step);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.#commit(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.#commit(this.max);
    }
  };

  #commit(next) {
    const before = this.value;
    this.value = next; // triggers attributeChangedCallback -> #sync + #render
    if (this.value !== before) {
      // A rating value is not a secret, so emitting it is correct. For a
      // sensitive field, put only { name, type } in detail and let the caller
      // read the value from the element — composed events reach any page script.
      this.dispatchEvent(new CustomEvent("change", {
        detail: { value: this.value },
        bubbles: true,
        composed: true, // cross the shadow boundary so the page can hear it
      }));
    }
  }

  // --- internal state out to the platform ------------------------------------

  #sync() {
    this.#internals.setFormValue(String(this.value));
    this.#internals.ariaValueNow = String(this.value);
    this.#internals.ariaValueMin = "0";
    this.#internals.ariaValueMax = String(this.max);
    this.#internals.ariaValueText = `${this.value} of ${this.max} stars`;
  }

  #render() {
    const { value, max } = this;
    if (this.#stars.children.length !== max) {
      this.#stars.replaceChildren(...Array.from({ length: max }, (_, i) => {
        const s = document.createElement("span");
        s.className = "star";
        s.setAttribute("part", "star"); // page can style each star via ::part(star)
        s.dataset.index = String(i);
        s.setAttribute("aria-hidden", "true"); // the host carries the semantics
        s.textContent = "★";
        return s;
      }));
    }
    for (const star of this.#stars.children) {
      star.toggleAttribute("data-on", Number(star.dataset.index) < value);
    }
    this.#sync();
  }

  // Form-associated hooks: keep the control honest on reset and restore.
  formResetCallback() { this.value = 0; }
  formStateRestoreCallback(state) { this.value = Number(state) || 0; }
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

customElements.define("star-rating", StarRating);
