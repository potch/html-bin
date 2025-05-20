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

const createBin = ({
  container,
  sources: rawSources,
  split,
  width,
  height,
}) => {
  const editorSplit = signal(split ?? 0.5);

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
    )
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
    console.log(splitOverride.value === 1 ? "⬅️" : "↔️");
    previewExpandButton.style.order = splitOverride.value === 0 ? -1 : "unset";
    previewExpandButton.innerText = splitOverride.value === 0 ? "➡️" : "↔️";
    editorExpandButton.innerText = splitOverride.value === 1 ? "⬅️" : "↔️";
  });

  const binEl = dom(
    "div",
    { className: "bin" },
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
    previewEl
  );

  if (width) binEl.style.setProperty("--bin-width", width);
  if (height) binEl.style.setProperty("--bin-height", height);

  // resizing
  const resizing = signal(false);

  const updateResize = (e) => {
    if (resizing.value) {
      let pos = e.clientX - getLeft(binEl);
      editorSplit.value = pos / binEl.offsetWidth;
    }
  };

  const startResize = (e) => {
    resizing.value = true;
    updateResize(e);
    splitOverride.value = false;
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
  });

  // editor tabs

  const activeEditor = computed((last) => {
    let t = activeTab.value;
    if (t === "js") return jsEditorEl;
    if (t === "css") return cssEditorEl;
    if (t === "html") return htmlEditorEl;
    return null;
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
};

createBin({
  container: document.body,
  sources: {
    js: `// js goes here
const el = document.querySelector('h1');

function update(time) {
  el.innerText = time;
}
  
setInterval(() => {
  update(Date.now());
}, 1000)`,
    css: `h1, .cool, #foo {
  color: #fc0;
  background: hsla(120, 50%, 75%, 0.3);
}`,
    html: "<h1>HI</h1>\n",
  },
  split: 0.6,
  width: "1024px",
  height: "512px",
});
