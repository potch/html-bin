import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  EditorView,
} from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import {
  indentOnInput,
  syntaxHighlighting,
  bracketMatching,
} from "@codemirror/language";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

// CodeMirror config for tab editors
const cmSetup = [
  lineNumbers(),
  highlightActiveLineGutter(),
  highlightSpecialChars(),
  history(),
  drawSelection(),
  dropCursor(),
  EditorState.allowMultipleSelections.of(true),
  indentOnInput(),
  bracketMatching(),
  highlightActiveLine(),
  EditorView.theme(
    {
      ".cm-content": {
        caretColor: "#fff",
      },
    },
    { dark: true }
  ),
  keymap.of([...defaultKeymap, ...historyKeymap]),
];

import { classHighlighter } from "@lezer/highlight";
import {
  dom as _,
  signal,
  computed,
  effect as _effect,
  on as _on,
  onEffect,
} from "@potch/minifw";

import styles from "./style.css";

let injectedStyles = null;

const getLeft = (el) => (el ? el.offsetLeft + getLeft(el.offsetParent) : 0);
const getTop = (el) => (el ? el.offsetTop + getTop(el.offsetParent) : 0);

const debounceComputed = (s, ms) => {
  const out = signal(s.value);
  let timeout = null;
  s.watch(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      timeout = null;
      out.value = s.value;
    }, ms);
  });
  return out;
};

const maybe = (condition, value) => (condition ? value : "");

const createEditors = (sources, parents, updateFactory) => {
  return {
    js: new EditorView({
      doc: sources.js.value,
      parent: parents.js,
      extensions: [
        cmSetup,
        javascript(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(updateFactory(sources.js)),
      ],
    }),
    css: new EditorView({
      doc: sources.css.value,
      parent: parents.css,
      extensions: [
        cmSetup,
        css(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(updateFactory(sources.css)),
      ],
    }),
    html: new EditorView({
      doc: sources.html.value,
      parent: parents.html,
      extensions: [
        cmSetup,
        html(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(updateFactory(sources.html)),
      ],
    }),
  };
};

/*
create a bin component.
Options:
  - `container` (optional Element): will automatically append the bin if provided
  - `sources`: object with optional `{ js, css, html }` strings of source to put
             in the corresponding editors
  - `split`: number from [0, 1] specifying the ratio between the editor and
           preview panes
  - `width`: CSS string to override default `--bin-width` value
  - `height`: CSS string to override default `--bin-height` value
Returns object with the following fields:
  - `el`: Element of the outermost HTML element of the bin
  - `editors`: contains `{ js, css, html }` properties with the CodeMirror
             instances for each editor tab
  - `activeTab`: a signal representing the currently active editor tab
  - `start`: call this function if you did not provide the `container` option
           after attaching `el` to the DOM
  - `teardown`: call this if you are removing and destroying the bin to
              disconnect all listeners
*/
export const createBin = ({
  container,
  sources: rawSources,
  split = 0.5,
  initialTab = "js",
  splitMode = true,
  width,
  height,
}) => {
  if (!injectedStyles) {
    injectedStyles = _("style", {}, styles);
    document.head.append(injectedStyles);
  }

  const editorSplit = signal(parseFloat(split));

  const teardownFns = [];
  const stopCapturingEffects = onEffect((fn) => teardownFns.push(fn));

  const effect = (...args) => {
    teardownFns.push(_effect(...args));
  };
  const on = (...args) => {
    teardownFns.push(_on(...args));
  };

  const actualWidth = signal(0);
  const widthObserver = new ResizeObserver((entries) => {
    if (entries[0]) {
      actualWidth.value = entries[0].contentRect.width;
    }
  });

  const isFullScreen = signal(false);

  const isMiniMode = computed(() => {
    const w = actualWidth.value;
    return !splitMode || w <= 700;
  });
  const resizing = signal(false);
  const splitOverride = signal(
    splitMode && initialTab === "preview" ? 0 : null
  );

  const activeTab = signal(initialTab);

  const sources = {
    js: signal(rawSources.js ?? "// js goes here"),
    css: signal(rawSources.css ?? "/* css goes here */\n"),
    html: signal(rawSources.html ?? "<!-- html goes here -->\n"),
  };

  // previews

  const scriptURL = computed((oldURL) => {
    if (oldURL) {
      URL.revokeObjectURL(oldURL);
    }
    return URL.createObjectURL(
      new Blob([sources.js.value], { type: "text/javascript" })
    );
  });

  const cssURL = computed((oldURL) => {
    if (oldURL) {
      URL.revokeObjectURL(oldURL);
    }
    return URL.createObjectURL(
      new Blob([sources.css.value], { type: "text/css" })
    );
  });

  const previewDoc = computed(
    () => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset=utf8>
        <link rel="stylesheet" href="${cssURL.value}">
      </head>
      <body>
        ${sources.html.value}
        <script type="module" src="${scriptURL.value}"></script>
      </body>
    </html>
  `
  );

  const debouncePreviewDoc = debounceComputed(previewDoc, 1000);

  const previewURL = computed((oldURL) => {
    if (oldURL) {
      URL.revokeObjectURL(oldURL);
    }
    return URL.createObjectURL(
      new Blob([debouncePreviewDoc.value], { type: "text/html" })
    );
  });

  // editor tabs

  const editorPanes = {
    js: _("div", {
      className: computed(
        () =>
          "bin__editor bin__editor--js" +
          maybe(activeTab.value === "js", " bin__editor--active")
      ),
    }),
    css: _("div", {
      className: computed(
        () =>
          "bin__editor bin__editor--css" +
          maybe(activeTab.value === "css", " bin__editor--active")
      ),
    }),
    html: _("div", {
      className: computed(
        () =>
          "bin__editor bin__editor--html" +
          maybe(activeTab.value === "html", " bin__editor--active")
      ),
    }),
  };

  const tabsForm = _(
    "form",
    {
      className: "bin__tabs",
      onsubmit: (e) => e.preventDefault(),
      oninput: (e) => (activeTab.value = tabsForm.elements.tab.value),
    },
    _(
      "label",
      { className: "bin__tab bin__editor_tab" },
      _("input", {
        type: "radio",
        name: "tab",
        value: "html",
        checked: computed(() => activeTab.value === "html"),
      }),
      "html"
    ),
    _(
      "label",
      { className: "bin__tab bin__editor_tab" },
      _("input", {
        type: "radio",
        name: "tab",
        value: "css",
        checked: computed(() => activeTab.value === "css"),
      }),
      "css"
    ),
    _(
      "label",
      { className: "bin__tab bin__editor_tab" },
      _("input", {
        type: "radio",
        name: "tab",
        value: "js",
        checked: computed(() => activeTab.value === "js"),
      }),
      "javascript"
    ),
    _(
      "label",
      { className: "bin__tab bin__preview_tab bin__mini_preview_tab" },
      _("input", {
        type: "radio",
        name: "tab",
        value: "preview",
        checked: computed(() => activeTab.value === "preview"),
        disabled: computed(() => (isMiniMode.value ? false : true)),
      }),
      "preview",
      _(
        "button",
        {
          className: "bin__preview__refresh bin__iconbutton",
          title: "reload the preview",
          "aria-label": "reload the preview",
          onclick: () => reloadPreview(),
        },
        "🔁"
      )
    )
  );

  const resizerEl = _("div", {
    className: "bin__resizer",
  });

  let previewEl = signal();

  const reloadPreview = () => {
    if (previewEl.value) {
      previewEl.value.src = previewURL.value;
    }
  };

  const binEl = _(
    "div",
    {
      className: computed(
        () =>
          "bin" +
          maybe(isMiniMode.value, " bin--mini-mode") +
          maybe(resizing.value, " bin--resizing") +
          maybe(isFullScreen.value, " bin--fullscreen")
      ),
    },
    _(
      "div",
      { className: "bin__widget" },
      _(
        "div",
        { className: "bin__tabstrip" },
        tabsForm,
        _("button", {
          className: "bin__editor__expand bin__iconbutton",
          title: "toggle showing only the editor",
          "aria-label": "toggle showing only the editor",
          innerText: computed(() => (splitOverride.value === 1 ? "⏮️" : "↔️")),
          onclick: () => {
            splitOverride.value = splitOverride.value === 1 ? null : 1;
          },
        })
      ),
      _(
        "div",
        { className: "bin__menu" },
        _(
          "button",
          {
            className: "bin__preview__expand bin__iconbutton",
            title: "show the code tabs",
            "aria-label": "show the code tabs",
            style: computed(() => ({
              display: splitOverride.value === 0 ? "block" : "none",
            })),
            onclick: () => {
              splitOverride.value = null;
            },
          },
          "⏭️"
        ),
        _(
          "div",
          { className: "bin__tab bin__preview_tab bin__tab--active" },
          "preview",
          _(
            "button",
            {
              className: "bin__preview__refresh bin__iconbutton",
              title: "reload the preview",
              "aria-label": "reload the preview",
              onclick: () => reloadPreview(),
            },
            "🔁"
          )
        ),
        _(
          "button",
          {
            className: "bin__preview__expand bin__iconbutton",
            title: "show only the preview",
            "aria-label": "show only the preview",
            style: computed(() => ({
              display: splitOverride.value === 0 ? "none" : "block",
            })),
            onclick: () => {
              splitOverride.value = 0;
            },
          },
          "↔️"
        )
      ),
      editorPanes.js,
      editorPanes.css,
      editorPanes.html,
      resizerEl,
      _("iframe", {
        ref: previewEl,
        className: computed(
          () =>
            "bin__preview" +
            maybe(activeTab.value === "preview", " bin__editor--active")
        ),
        src: previewURL,
      }),
      _("div", { className: "bin__controls" })
    ),
    _("button", {
      className: "bin__fullscreen bin__iconbutton",
      title: "toggle fullscreen mode",
      "aria-label": "toggle fullscreen mode",
      innerText: computed(() => (isFullScreen.value ? "↖️" : "↘️")),
      onclick: () => (isFullScreen.value = !isFullScreen.value),
    })
  );

  if (width) binEl.style.setProperty("--bin-width", width);
  if (height) binEl.style.setProperty("--bin-height", height);

  // split resizing

  const ilerp = (a, b, i) => (i - a) / (b - a);
  const clamp = (a, b, n) => Math.max(a, Math.min(n, b));

  const updateResize = (e) => {
    if (resizing.value) {
      let pos = e.clientX - resizerEl.offsetWidth / 2 - getLeft(binEl);
      editorSplit.value = clamp(
        0.2,
        0.8,
        ilerp(10, binEl.offsetWidth - 10, pos)
      );
    }
  };

  const startResize = (e) => {
    resizing.value = true;
    updateResize(e);
    splitOverride.value = null;
  };

  const endResize = (e) => {
    resizing.value = false;
    updateResize(e);
  };

  on(resizerEl, "mousedown", startResize);
  on(document.body, "mouseup", endResize);
  on(document.body, "mouseleave", endResize);

  on(binEl, "mousemove", (e) => {
    updateResize(e);
  });

  // set the split in CSS, factoring in expanded panes
  effect(() => {
    const o = splitOverride.value;
    const s = editorSplit.value;
    binEl.style.setProperty("--resizer-split", o !== null ? o : s);
  });

  // editor tabs

  effect(() => {
    const t = activeTab.value;
    const m = isMiniMode.value;
    if (t === "preview" && !m) {
      tabsForm.elements.tab.value = "js";
      activeTab.value = "js";
    }
  });

  // create CM editors

  const updateFactory = (s) => (v) => {
    if (v.docChanged) {
      // how to get the full text content from the editor
      s.value = v.state.doc.toString();
    }
  };

  const editors = createEditors(sources, editorPanes, updateFactory);

  // mount bin and start
  const start = () => widthObserver.observe(binEl);
  if (container) {
    container.append(binEl);
    start();
  }

  // destroy / teardown
  stopCapturingEffects();

  const teardown = () => {
    while (teardownFns.length) {
      teardownFns.pop()();
    }
    widthObserver.disconnect();
  };

  return {
    el: binEl,
    editors,
    activeTab,
    splitMode,
    start,
    teardown,
  };
};
