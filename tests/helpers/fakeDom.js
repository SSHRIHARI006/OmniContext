/**
 * Minimal dependency-free DOM double.
 *
 * Implements just enough of the Element/Document surface used by the
 * OmniContext runtime sources (adapters, migration prompt engine): a
 * selector engine covering tag/class/id/attribute compound selectors with
 * descendant and child combinators, text content aggregation, cloning,
 * removal, and event capture.
 */

const ATTR_PATTERN = /\[([a-zA-Z0-9_:-]+)(?:([~^$*|]?=)"([^"]*)")?\]/g;

function parseCompound(compound) {
  const parsed = { tag: null, id: null, classes: [], attrs: [] };
  let rest = compound.replace(ATTR_PATTERN, (_match, name, operator, value) => {
    parsed.attrs.push({ name, operator: operator || null, value: value ?? null });
    return '';
  });

  const idMatch = rest.match(/#([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    parsed.id = idMatch[1];
    rest = rest.replace(idMatch[0], '');
  }

  for (const cls of rest.match(/\.[a-zA-Z0-9_-]+/g) || []) parsed.classes.push(cls.slice(1));
  rest = rest.replace(/\.[a-zA-Z0-9_-]+/g, '');

  const tag = rest.trim();
  if (tag && tag !== '*') parsed.tag = tag.toUpperCase();
  return parsed;
}

function parseSelector(selector) {
  return selector.split(',').map((part) => {
    const tokens = part.trim().split(/\s*(>)\s*|\s+/).filter(Boolean);
    const steps = [];
    let combinator = 'descendant';
    for (const token of tokens) {
      if (token === '>') {
        combinator = 'child';
        continue;
      }
      steps.push({ compound: parseCompound(token), combinator });
      combinator = 'descendant';
    }
    return steps;
  });
}

function attributeMatches(element, attr) {
  const actual = element.getAttribute(attr.name);
  if (actual === null) return false;
  if (attr.operator === null) return true;
  switch (attr.operator) {
    case '=':
      return actual === attr.value;
    case '*=':
      return actual.includes(attr.value);
    case '^=':
      return actual.startsWith(attr.value);
    case '$=':
      return actual.endsWith(attr.value);
    case '~=':
      return actual.split(/\s+/).includes(attr.value);
    default:
      return false;
  }
}

function matchesCompound(element, compound) {
  if (compound.tag && element.tagName !== compound.tag) return false;
  if (compound.id && element.id !== compound.id) return false;
  if (compound.classes.some((cls) => !element.classList.contains(cls))) return false;
  return compound.attrs.every((attr) => attributeMatches(element, attr));
}

function matchesSteps(element, steps, scope) {
  const last = steps[steps.length - 1];
  if (!matchesCompound(element, last.compound)) return false;
  if (steps.length === 1) return true;

  const remaining = steps.slice(0, -1);
  if (last.combinator === 'child') {
    const parent = element.parentElement;
    if (!parent || parent === scope.ownerNode) return false;
    return matchesSteps(parent, remaining, scope);
  }

  let ancestor = element.parentElement;
  while (ancestor) {
    if (matchesSteps(ancestor, remaining, scope)) return true;
    ancestor = ancestor.parentElement;
  }
  return false;
}

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  get _values() {
    return (this.element.getAttribute('class') || '').split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this._values.includes(name);
  }

  add(name) {
    if (!this.contains(name)) {
      this.element.setAttribute('class', [...this._values, name].join(' '));
    }
  }
}

class FakeElement {
  /**
   * @param {string} tag
   * @param {Object} [props] attributes plus the pseudo-props `text` (own text
   *   node), `visible` (drives offset sizes) and `children`.
   */
  constructor(tag, props = {}, children = []) {
    const { text = '', visible = true, ...attrs } = props;
    this.tagName = tag.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.text = text;
    this.visible = visible;
    this.dispatchedEvents = [];
    this.focused = false;
    this.classList = new FakeClassList(this);

    for (const [name, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null) this.setAttribute(name, String(value));
    }
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  get dataset() {
    const data = {};
    for (const [name, value] of this.attributes) {
      if (!name.startsWith('data-')) continue;
      const key = name.slice(5).replace(/-([a-z])/g, (_m, letter) => letter.toUpperCase());
      data[key] = value;
    }
    return data;
  }

  get isContentEditable() {
    return this.getAttribute('contenteditable') === 'true';
  }

  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.children = [];
    this.text = value;
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(value) {
    this.textContent = value;
  }

  get offsetWidth() {
    return this.visible ? 100 : 0;
  }

  get offsetHeight() {
    return this.visible ? 20 : 0;
  }

  getClientRects() {
    return this.visible ? [{ width: 100, height: 20 }] : [];
  }

  focus() {
    this.focused = true;
  }

  dispatchEvent(event) {
    this.dispatchedEvents.push(event);
    return true;
  }

  contains(other) {
    if (other === this) return true;
    return this.children.some((child) => child.contains(other));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (node.matches(selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  matches(selector) {
    return parseSelector(selector).some((steps) => matchesSteps(this, steps, { ownerNode: null }));
  }

  descendants() {
    const all = [];
    for (const child of this.children) {
      all.push(child, ...child.descendants());
    }
    return all;
  }

  querySelectorAll(selector) {
    const groups = parseSelector(selector);
    return this.descendants().filter((element) =>
      groups.some((steps) => matchesSteps(element, steps, { ownerNode: this }))
    );
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    const index = siblings.indexOf(this);
    if (index !== -1) siblings.splice(index, 1);
    this.parentElement = null;
  }

  cloneNode() {
    const clone = new FakeElement(this.tagName, { text: this.text, visible: this.visible });
    for (const [name, value] of this.attributes) clone.setAttribute(name, value);
    for (const child of this.children) clone.appendChild(child.cloneNode(true));
    return clone;
  }
}

/**
 * Builds an element tree. `props.children` may be supplied instead of the
 * third argument for terser nesting.
 */
export function el(tag, props = {}, children = []) {
  const { children: nested = [], ...rest } = props;
  return new FakeElement(tag, rest, [...nested, ...children]);
}

/** Creates a document double whose <body> holds the supplied children. */
export function createDocument(children = []) {
  const body = el('body', {}, children);
  return {
    body,
    documentElement: body,
    querySelector: (selector) => (body.matches(selector) ? body : body.querySelector(selector)),
    querySelectorAll: (selector) => {
      const matches = body.querySelectorAll(selector);
      return body.matches(selector) ? [body, ...matches] : matches;
    }
  };
}

export { FakeElement };
