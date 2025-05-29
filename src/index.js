import {
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  crosshairCursor,
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
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";

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
  crosshairCursor(),
  highlightActiveLine(),
  highlightSelectionMatches(),
  EditorView.theme(
    {
      ".cm-content": {
        caretColor: "#fff",
      },
    },
    { dark: true }
  ),
  keymap.of([...defaultKeymap, ...searchKeymap, ...historyKeymap]),
];

import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

import { classHighlighter } from "@lezer/highlight";
import {
  dom as _,
  signal,
  computed,
  effect as _effect,
  on as _on,
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

export const createBin = ({
  container,
  sources: rawSources,
  split,
  width,
  height,
}) => {
  if (!injectedStyles) {
    injectedStyles = _("style", {}, styles);
    document.head.append(injectedStyles);
  }

  const editorSplit = signal(parseFloat(split) || 0.5);

  const teardownFns = [];
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

  const isMiniMode = computed(() => actualWidth.value <= 700);
  const resizing = signal(false);
  const splitOverride = signal(null);

  const activeTab = signal("js");

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
        <script>
          window.onerror = function (msg, file, line, col, error) {
            window.top.postMessage({
              type: 'error',
              msg: msg,
              line: line,
              col: col,
              stack: error.stack.split('\\n')
            }, '*');
          };
        </script>
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

  const jsEditorEl = _("div", {
    className: computed(
      () =>
        "bin__editor bin__editor--js" +
        maybe(activeTab.value === "js", " bin__editor--active")
    ),
  });
  const cssEditorEl = _("div", {
    className: computed(
      () =>
        "bin__editor bin__editor--css" +
        maybe(activeTab.value === "css", " bin__editor--active")
    ),
  });
  const htmlEditorEl = _("div", {
    className: computed(
      () =>
        "bin__editor bin__editor--html" +
        maybe(activeTab.value === "html", " bin__editor--active")
    ),
  });

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
      _("input", { type: "radio", name: "tab", value: "html" }),
      "html"
    ),
    _(
      "label",
      { className: "bin__tab bin__editor_tab" },
      _("input", { type: "radio", name: "tab", value: "css" }),
      "css"
    ),
    _(
      "label",
      { className: "bin__tab bin__editor_tab" },
      _("input", { type: "radio", name: "tab", value: "js", checked: true }),
      "javascript"
    ),
    _(
      "label",
      { className: "bin__tab bin__preview_tab bin__mini_preview_tab" },
      _("input", {
        type: "radio",
        name: "tab",
        value: "preview",
        disabled: computed(() => (isMiniMode.value ? false : true)),
      }),
      "preview",
      _(
        "button",
        {
          className: "bin__preview__refresh bin__iconbutton",
          title: "reload the preview",
          "aria-label": "reload the preview",
          onclick: () => {
            previewEl.value?.contentWindow.location.reload();
          },
        },
        "🔁"
      )
    )
  );

  const resizerEl = _("div", {
    className: "bin__resizer",
  });

  let previewEl = signal();

  const binEl = _(
    "div",
    {
      className: computed(
        () =>
          "bin" +
          maybe(isMiniMode.value, " bin--mini-mode") +
          maybe(resizing.value, " bin--resizing")
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
          "div",
          { className: "bin__tab bin__preview_tab bin__tab--active" },
          "preview",
          _(
            "button",
            {
              className: "bin__preview__refresh bin__iconbutton",
              title: "reload the preview",
              "aria-label": "reload the preview",
              onclick: () => {
                previewEl.value?.contentWindow.location.reload();
              },
            },
            "🔁"
          )
        ),
        _("button", {
          className: "bin__preview__expand bin__iconbutton",
          title: "toggle showing only the preview",
          "aria-label": "toggle showing only the preview",
          innerText: computed(() => (splitOverride.value === 0 ? "⏭️" : "↔️")),
          style: computed(() => ({
            order: splitOverride.value === 0 ? -1 : "unset",
          })),
          onclick: () => {
            splitOverride.value = splitOverride.value === 0 ? null : 0;
          },
        })
      ),
      jsEditorEl,
      cssEditorEl,
      htmlEditorEl,
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
    )
  );

  if (width) binEl.style.setProperty("--bin-width", width);
  if (height) binEl.style.setProperty("--bin-height", height);

  // resizing

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

  effect(() => {
    binEl.style.setProperty(
      "--resizer-split",
      splitOverride.value !== null ? splitOverride.value : editorSplit.value
    );
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

  const update = (s) => (v) => {
    if (v.docChanged) {
      // how to get the full text content from the editor
      s.value = v.state.doc.toString();
    }
  };

  const editors = {
    js: new EditorView({
      doc: sources.js.value,
      parent: jsEditorEl,
      extensions: [
        cmSetup,
        javascript(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(update(sources.js)),
      ],
    }),
    css: new EditorView({
      doc: sources.css.value,
      parent: cssEditorEl,
      extensions: [
        cmSetup,
        css(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(update(sources.css)),
      ],
    }),
    html: new EditorView({
      doc: sources.html.value,
      parent: htmlEditorEl,
      extensions: [
        cmSetup,
        html(),
        syntaxHighlighting(classHighlighter),
        EditorView.updateListener.of(update(sources.html)),
      ],
    }),
  };

  // mount bin and start
  const start = () => widthObserver.observe(binEl);
  if (container) {
    container.append(binEl);
    start();
  }

  // destroy / teardown
  const findEffects = (node) => {
    if (node._effects) {
      teardownFns.push(...node._effects);
    }
    for (let n of node?.childNodes) findEffects(n);
  };
  findEffects(binEl);

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
    start,
    teardown,
  };
};
