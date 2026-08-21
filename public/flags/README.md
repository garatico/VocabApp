# Flag icons

Square-cropped country flags, copied from the `flag-icons` npm package
(https://github.com/lipis/flag-icons, MIT licensed) rather than imported at
build time — `public/` is served as-is (see `vite.config.js`'s `publicDir`
and `CLAUDE.md`), nothing here goes through a bundler that would let a CSS
`@import` pull individual files out of `node_modules`.

Self-hosted images rather than Unicode flag emoji (🇪🇸, 🇵🇹, ...) on purpose:
Windows' bundled emoji font does not carry flag glyphs, so those regional-
indicator character pairs render as literal two-letter codes ("ES", "PT") on
a lot of Windows browsers instead of a flag. An image has no such dependency.

Filenames are lowercase ISO 3166-1 alpha-2 codes (`es.svg`, `pt.svg`, ...),
matching `country` in `LANGUAGES[].flagOptions` (src/client/data/languages.ts).
To add a country, copy `node_modules/flag-icons/flags/1x1/<cc>.svg` here and
add an entry there.
