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
import { dom, signal, computed, effect, on } from "@potch/minifw";

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

export const createBin = ({
  container,
  sources: rawSources,
  split,
  width,
  height,
}) => {
  const editorSplit = signal(parseFloat(split) || 0.5);

  const actualWidth = signal(0);
  const widthObserver = new ResizeObserver((entries) => {
    if (entries[0]) {
      actualWidth.value = entries[0].contentRect.width;
    }
  });
  const isMiniMode = computed(() => actualWidth.value <= 700);

  const update = (s) => (v) => {
    if (v.docChanged) {
      // how to get the full text content from the editor
      s.value = v.state.doc.toString();
    }
  };

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

  const previewEl = dom("iframe", { className: "bin__preview" });

  effect(() => {
    previewEl.src = previewURL.value;
  });

  // editor tabs

  const activeTab = signal("js");

  const jsEditorEl = dom("div", { className: "bin__editor bin__editor--js" });
  const cssEditorEl = dom("div", { className: "bin__editor bin__editor--css" });
  const htmlEditorEl = dom("div", {
    className: "bin__editor bin__editor--html",
  });

  const previewLeftTabInput = dom("input", {
    type: "radio",
    name: "tab",
    value: "preview",
    disabled: true,
  });
  const previewLeftTab = dom(
    "label",
    { className: "bin__tab bin__preview_tab bin__mini_preview_tab" },
    previewLeftTabInput,
    "preview"
  );

  effect(() => {
    if (isMiniMode.value) {
      previewLeftTabInput.removeAttribute("disabled");
    } else {
      previewLeftTabInput.setAttribute("disabled", true);
    }
  });

  const tabsForm = dom(
    "form",
    {
      className: "bin__tabs",
      onsubmit: (e) => e.preventDefault(),
      oninput: (e) => (activeTab.value = tabsForm.elements.tab.value),
    },
    dom(
      "label",
      { className: "bin__tab" },
      dom("input", { type: "radio", name: "tab", value: "html" }),
      "html"
    ),
    dom(
      "label",
      { className: "bin__tab" },
      dom("input", { type: "radio", name: "tab", value: "css" }),
      "css"
    ),
    dom(
      "label",
      { className: "bin__tab" },
      dom("input", { type: "radio", name: "tab", value: "js", checked: true }),
      "javascript"
    ),
    previewLeftTab
  );

  const resizerEl = dom("div", {
    className: "bin__resizer",
  });

  const splitOverride = signal(null);

  const editorExpandButton = dom(
    "button",
    {
      className: "bin__editor__expand bin__iconbutton",
      title: "toggle showing only the editor",
      "aria-label": "toggle showing only the editor",
      onclick: () => {
        splitOverride.value = splitOverride.value === 1 ? null : 1;
      },
    },
    "↔️"
  );

  const previewExpandButton = dom(
    "button",
    {
      className: "bin__preview__expand bin__iconbutton",
      title: "toggle showing only the preview",
      "aria-label": "toggle showing only the preview",

      onclick: () => {
        splitOverride.value = splitOverride.value === 0 ? null : 0;
      },
    },
    "↔️"
  );

  effect(() => {
    previewExpandButton.style.order = splitOverride.value === 0 ? -1 : "unset";
    previewExpandButton.innerText = splitOverride.value === 0 ? "⏭️" : "↔️";
    editorExpandButton.innerText = splitOverride.value === 1 ? "⏮️" : "↔️";
  });

  const binEl = dom(
    "div",
    { className: "bin" },
    dom(
      "div",
      { className: "bin__widget" },
      dom("div", { className: "bin__tabstrip" }, tabsForm, editorExpandButton),
      dom(
        "div",
        { className: "bin__menu" },
        dom(
          "div",
          { className: "bin__preview__tab" },
          "preview",
          dom(
            "button",
            {
              className: "bin__preview__refresh bin__iconbutton",
              title: "reload the preview",
              "aria-label": "reload the preview",
              onclick: () => {
                previewEl.contentWindow.location.reload();
              },
            },
            "🔁"
          )
        ),
        previewExpandButton
      ),
      jsEditorEl,
      cssEditorEl,
      htmlEditorEl,
      resizerEl,
      previewEl,
      dom("div", { className: "bin__controls" })
    )
  );

  if (width) binEl.style.setProperty("--bin-width", width);
  if (height) binEl.style.setProperty("--bin-height", height);
  effect(() => {
    binEl.classList.toggle("bin--mini-mode", isMiniMode.value);
  });

  // resizing
  const resizing = signal(false);

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

  effect(() => console.log(editorSplit.value, splitOverride.value));

  const startResize = (e) => {
    resizing.value = true;
    updateResize(e);
    splitOverride.value = null;
  };

  const endResize = (e) => {
    resizing.value = false;
    updateResize(e);
  };

  effect(() => {
    binEl.classList.toggle("bin--resizing", resizing.value);
  });

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
    console.log(
      splitOverride.value !== null ? splitOverride.value : editorSplit.value
    );
  });

  // editor tabs

  const activeEditor = computed(() => {
    let t = activeTab.value;
    if (t === "js") return jsEditorEl;
    if (t === "css") return cssEditorEl;
    if (t === "html") return htmlEditorEl;
    if (t === "preview") return previewEl;
    return null;
  });

  effect(() => {
    const t = activeTab.value;
    const m = isMiniMode.value;
    if (t === "preview" && !m) {
      tabsForm.elements.tab.value = "js";
      activeTab.value = "js";
    }
  });

  effect(() => {
    binEl
      .querySelector(".bin__editor--active")
      ?.classList.remove("bin__editor--active");
    activeEditor.value?.classList.add("bin__editor--active");
  });

  // create CM editors
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

  container.append(binEl);
  widthObserver.observe(binEl);

  return {
    editors,
    activeTab,
  };
};
