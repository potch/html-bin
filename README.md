# html-bin

a codebin widget for embeddable editable live demos built on top of [CodeMirror](https://codemirror.net/)

## API

### `createBin`

create a bin component.

Options:

- `container` (optional Element): will automatically append the bin if provided
- `sources`: object with optional `{ js, css, html }` strings of source to put
  in the corresponding editors
- `split`: number from [0, 1] specifying the ratio between the editor and
  preview panes. defaults to `0.5`
- `width`: CSS string to override default `--bin-width` value. defaults to `100%`
- `height`: CSS string to override default `--bin-height` value. defaults to `512px`

Returns object with the following fields:

- `el`: Element of the outermost HTML element of the bin
- `editors`: contains `{ js, css, html }` properties with the CodeMirror
  instances for each editor tab
- `activeTab`: a signal representing the currently active editor tab
- `start`: call this function if you did not provide the `container` option
  after attaching `el` to the DOM
- `teardown`: call this if you are removing and destroying the bin to
  disconnect all listeners
