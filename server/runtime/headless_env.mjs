class HeadlessElement {
  constructor(tagName = "div", id = "") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.id = id || "";
    this.style = {};
    this.dataset = {};
    this.className = "";
    this.classList = {
      add() {},
      remove() {},
      toggle() { return false; },
      contains() { return false; },
    };
    this.value = "";
    this.checked = false;
    this.disabled = false;
    this.childNodes = [];
    this.children = this.childNodes;
    this._textContent = "";
    this._innerHTML = "";
    this.width = 0;
    this.height = 0;
    this.clientWidth = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.options = [];

    Object.defineProperty(this, "textContent", {
      get: () => this._textContent,
      set: (value) => {
        this._textContent = String(value ?? "");
        if (this._textContent !== "") {
          this.childNodes.length = 0;
          this._innerHTML = "";
        }
      },
    });
    Object.defineProperty(this, "innerHTML", {
      get: () => this._innerHTML,
      set: (value) => {
        this._innerHTML = String(value ?? "");
        this.childNodes.length = 0;
        if (this._innerHTML !== "") this._textContent = "";
      },
    });
  }

  addEventListener() {}
  removeEventListener() {}
  appendChild(node = null) {
    if (node == null) return null;
    this.childNodes.push(node);
    this._textContent = "";
    return node;
  }
  removeChild(node = null) {
    const idx = this.childNodes.indexOf(node);
    if (idx >= 0) this.childNodes.splice(idx, 1);
    return node;
  }
  replaceChildren(...nodes) {
    this.childNodes.length = 0;
    for (const node of nodes) {
      if (node != null) this.childNodes.push(node);
    }
    this._textContent = "";
    this._innerHTML = "";
  }
  setAttribute() {}
  getAttribute() { return null; }
  focus() {}
  blur() {}
  click() {}
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  cloneNode() { return new HeadlessElement(this.tagName, this.id); }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  }
  setPointerCapture() {}
  releasePointerCapture() {}
  getContext() {
    return new Proxy({}, {
      get(_target, prop) {
        if (prop === "canvas") return null;
        return () => {};
      },
      set() {
        return true;
      },
    });
  }
}

function createElementStore() {
  const byId = new Map();
  return {
    get(id = "") {
      const key = String(id ?? "");
      if (!byId.has(key)) byId.set(key, new HeadlessElement("div", key));
      return byId.get(key);
    },
  };
}

export function createHeadlessBrowserEnv(options = {}) {
  globalThis.__DUNGEONPUNK_HEADLESS__ = true;
  if (typeof options.liveTickCombat === "boolean") {
    globalThis.__DUNGEONPUNK_LIVE_TICK_COMBAT__ = options.liveTickCombat;
  } else {
    delete globalThis.__DUNGEONPUNK_LIVE_TICK_COMBAT__;
  }

  const store = createElementStore();
  const body = store.get("body");
  body.dataset = {
    canAdminControls: "0",
    isAuthenticated: String(options.isAuthenticated ? "1" : "0"),
    saveCsrf: String(options.csrfToken ?? ""),
    saveMaxSlots: String(options.saveMaxSlots ?? "10"),
    characterMaxSlots: String(options.characterMaxSlots ?? "5"),
    liveTickCombat: typeof options.liveTickCombat === "boolean" ? (options.liveTickCombat ? "1" : "0") : "",
  };

  const documentRef = {
    body,
    documentElement: new HeadlessElement("html", "html"),
    visibilityState: "visible",
    addEventListener() {},
    removeEventListener() {},
    getElementById(id) {
      return store.get(id);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement(tag) {
      return new HeadlessElement(tag);
    },
  };

  const locationRef = { href: String(options.href ?? "http://localhost/") };
  const matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  globalThis.Element = HeadlessElement;
  globalThis.HTMLElement = HeadlessElement;
  globalThis.Node = HeadlessElement;
  globalThis.document = documentRef;
  globalThis.window = {
    document: documentRef,
    location: locationRef,
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
    matchMedia,
    confirm: () => true,
    prompt: () => "",
  };
  globalThis.navigator = { userAgent: "dungeonpunk-headless" };
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.performance = { now: () => Date.now() };
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async json() { return {}; },
    async text() { return ""; },
  });
  globalThis.confirm = () => true;
  globalThis.prompt = () => "";
  globalThis.Image = class HeadlessImage {
    constructor() {
      this.width = 0;
      this.height = 0;
      this.onload = null;
      this.onerror = null;
      this._src = "";
    }

    set src(value) {
      this._src = String(value ?? "");
      if (typeof this.onload === "function") queueMicrotask(() => this.onload());
    }

    get src() {
      return this._src;
    }
  };

  return { document: documentRef, window: globalThis.window, store };
}
