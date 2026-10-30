# JSON Studio

A simple, private JSON viewer, editor, and formatter. No dependencies, build step, account, analytics, or server uploads.

## Run locally

Requires Node.js 18 or newer.

```sh
npm start
```

Open http://localhost:3000. To use another port: `PORT=8080 npm start`.

The server binds only to your machine (127.0.0.1). Keep the terminal running while using the app. The four frontend files can also be hosted on any static web server; serve over HTTP rather than opening index.html directly so the module worker can load.

## Features

- Paste JSON, open a file, or drag and drop one (up to 100 MB).
- Format with 2 spaces, 4 spaces, or tabs; minify, validate, copy, and download.
- Collapsible tree with 100 children per batch. Click a scalar value to edit it as JSON.
- Case-insensitive find with next-match navigation and wraparound.
- Validation errors show line and column. Supports all JSON root types.
- Numeric lexemes, duplicate property names, string escapes, and property order survive formatting. Large integers never pass through JavaScript Number.
- Keyboard shortcut: Cmd/Ctrl + Shift + F. Tab indents in the editor.
- Responsive layout, keyboard controls, and unsaved-change warning on page close.

## Large files

Parsing, validation, formatting, file reading, and tree scanning run in a Web Worker. The complete document stays in worker memory, and tree children are scanned only when requested. Source documents over 5,242,880 characters use a read-only preview of the first 200,000 characters. You can still browse the whole tree, edit scalar values up to 5,242,880 characters, search the complete document, format/minify, and download it. Copy is available for smaller documents; use Download for large ones. JSON Lines/NDJSON is not supported: input must be one valid JSON document.

The file input limit is 100 MB; formatted output is capped at 100 million characters. This is an in-memory tool, not a streaming gigabyte editor. Practical capacity depends on your browser and device. Indentation can increase the size significantly. A 25 MB document and a 12,000-level nested document are included in engine checks. Data is not persisted: download your changes before closing the page. Opening another document or loading the example replaces the current document.

## Checks

```sh
npm test
```

Covers validation, precise number preservation, formatting, tree pagination/offsets, malformed input, deep nesting, and a 25 MB file. No third-party JavaScript or network resources are used by the app.
