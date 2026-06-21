---
name: rsbuild quill-icons Illustration fix
description: How to silence missing .webp build errors from @deriv/quill-icons/Illustration in rsbuild/rspack
---

## The rule
When `@deriv/quill-icons/Illustration` has missing webp assets (installed package is incomplete), use `tools.rspack.resolve.alias` — NOT `source.alias` — to redirect to a shim.

**Why:** `source.alias` (the rsbuild-layer alias) only intercepts imports in **source files**. Imports that originate from within node_modules (e.g. `@deriv-com/ui` → `@deriv/quill-icons/Illustration`) bypass it entirely and cause `Module not found` build failures on full rebuilds.

**How to apply:** In `rsbuild.config.ts`:
```ts
tools: {
    rspack: {
        resolve: {
            alias: {
                '@deriv/quill-icons/dist/react/Illustration': path.resolve(__dirname, 'src/components/shims/quill-icons-illustration/index.js'),
                '@deriv/quill-icons/Illustration': path.resolve(__dirname, 'src/components/shims/quill-icons-illustration/index.js'),
            },
        },
    },
},
```
Both keys are needed: one for the package-name import, one for the resolved dist path.
Do NOT use `type: 'asset/inline'` module rules — this rspack version throws `unreachable: unknown module type: asset/inline`.
