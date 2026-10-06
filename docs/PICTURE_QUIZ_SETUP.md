# Picture Quiz — where the pictures come from

Picture Quiz shows a picture and asks for the word. It has three sub-modes, chosen in the controls bar
before Start (`#pictureStyleGroup`): **type** the word, **flashcard**, and **click** the matching picture.
The code is `src/client/modes/picture-mode.ts`; its styles are `src/client/styles-lazy/picture.css`.

## What a word can show

A *concept* (say "dog") groups the words that mean it in every language — `perro`, `cachorro`, `cão`,
`cane`, `chien`, `Hund`, `hond` — and carries up to three kinds of visual:

| Kind | Where it lives | URL | Notes |
|---|---|---|---|
| Photo | `data/images/<domain>/<name>.jpg` | `/images/<name>.jpg` | Wikipedia photos; preferred when there is one |
| OpenMoji SVG | `data/emoji/<domain>/<hex>.svg` | `/emoji/<hex>.svg` | e.g. `1F436.svg` for 🐶 |
| Shared custom SVG | `data/svgs/<concept>.svg` | `/svgs/<concept>.svg` | named by **English concept**, not by word |
| Emoji character | in `visual-map.ts` | — | the always-available last resort |

A concept may have several visuals; the card then shows arrows (on phones they sit over the picture's
edges) and dots to cycle through them. **A picture that fails to load is skipped automatically**, falling
through to the next visual and finally the emoji — so a missing or corrupt file degrades gracefully
instead of leaving a broken image.

The `<domain>` folders (`animals/`, `food/`, `nature/`) are only filing. URLs are **flat**: two files with
the same name in different domains collide, and the server reports the clash (`lib/flat-static.ts`).

## The two concept maps

Words are tied to concepts in two places, which are separate on purpose and **must agree**:

- `src/client/data/visual-map.ts` — the quiz's own map: concept → `imageUrl` / `svgUrl` / `emoji` and the
  words in each language. Lookup lowercases and strips diacritics, so `árbol`, `Árbol` and `arbol` match
  and German capitals (`Bär`) are fine.
- `src/shared/assets/svg-concepts.ts` — word → shared-SVG concept, used by the server
  (`lib/svg-loader.ts`, which also checks the file exists) and by the desktop app, which has no
  filesystem to ask and checks a build-time manifest instead (`client/tauri/asset-resolver.ts`).

## Adding a picture

1. Put the file in the right folder: a photo in `data/images/<domain>/`, an OpenMoji SVG in
   `data/emoji/<domain>/`, or a custom SVG in `data/svgs/` named by English concept (`dog.svg`).
2. Add the words to the concept in `visual-map.ts` (and in `svg-concepts.ts` for a shared SVG).
3. Reload — nothing else to register. The API's `svg_url` field is derived from the files and the map, so
   there is no database column to migrate.

## How the files reach the browser

- **Dev / Node server:** Express serves `/images`, `/emoji` (flat, via `flat-static.ts`), `/svgs` and
  `/audio`. Photos are resized to WebP on the first request that accepts one and cached; the originals are
  never touched (`lib/image-optimizer.ts`).
- **Static web build** (`npm run build:static`, what the hosted site deploys): the same folders are copied
  flat into `public/` and the photos shrunk to 800 px wide in place, keeping their names
  (`scripts/build-static.ts`).
- **Desktop / Android builds:** `scripts/build-native.ts` stages them the same way
  (`scripts/lib/asset-flatten.ts`).

## Troubleshooting

- **A word shows only an emoji:** it has no photo or SVG yet — add the file and the concept entry above.
- **A picture is broken or blank:** check the file is a real image (a zero-byte or one-byte file is skipped
  silently by the fall-through) and that the name in the map matches the filename exactly, extension
  included.
- **404 on `/images/…` in the static build:** the file was not under `data/images/<domain>/` when the build
  ran, or two domains held the same filename and the second was dropped (the build logs the clash).
