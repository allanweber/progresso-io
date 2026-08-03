<!-- BEGIN:nextjs-agent-rules -->

# Next.js: ALWAYS read docs before coding

Before any Next.js work, find and read the relevant doc in `node_modules/next/dist/docs/`. Your training data is outdated — the docs are the source of truth.

<!-- END:nextjs-agent-rules -->

# Components: don't extract single-use components

Keep markup inline where it is used. Only split something into its own component when it is **reused in more than one place** or when a **technical boundary requires it** (e.g. a `"use client"` island inside a Server Component page). Do not create a component just to organize a one-off chunk of JSX — inlining is preferred over granular indirection.

# Routes: always in English

The UI copy is in Brazilian Portuguese, but route segments/URLs must be in **English** (e.g. `/register`, `/forgot-password` — not `/registro`, `/esqueci-a-senha`).
