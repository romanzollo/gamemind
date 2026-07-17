---
name: gamemind-taste-ui
description: >-
  GameMind UI/UX work with Taste Skill discipline. Use when changing visuals,
  layout, typography, theme tokens, shared UI, page polish, redesign, or any
  frontend presentation for GameMind. Also use for home, auth, quiz, result,
  leaderboard, profile, or admin styling.
---

# GameMind Taste UI

When this skill applies, UI work is **presentation under a locked design system**, not a greenfield rewrite and not a backend change.

## Mandatory reads

1. `docs/TASTE_SKILL.md` — brief, lock, waves, prompts, **change log**
2. If missing lock (§4 unlocked): do not invent a second brand; either run foundation flow or stay within existing `globals.css` tokens
3. `docs/DECISIONS.md` → Taste Skill Visual Identity (constraints)

## External skills

Prefer installed Taste skills when present:

- Foundation / redesign of existing screens: `redesign-existing-projects`
- Implementation rules + dials: `design-taste-frontend` (v2)
- One style overlay only if locked: soft **or** minimalist — not both, not brutalist unless brief changes

Sources: https://www.tasteskill.dev/ · https://github.com/Leonxlnx/taste-skill

## Hard constraints (GameMind)

- Do **not** change Prisma, direct `pg`, quiz snapshot, scoring, or Auth.js security for “prettier UI”
- Keep i18n dictionaries (`ru` / `en`); no hardcoded user-visible strings
- Extend CSS variables in `src/app/globals.css` + `@theme inline`; no parallel one-off palettes in components
- Server Components by default; Client Components only for interactivity
- Preserve IMAGE_GUESS full-frame (no regress to cropped 16:9 `object-cover`)
- Do not mix with repository file splits (§11.7) in the same change set

## Workflow

1. Check `docs/TASTE_SKILL.md` §1 Status — foundation vs ongoing
2. If foundation incomplete and task is a big redesign: follow Wave plan §5; start with audit if §6 empty
3. If ongoing feature UI: extend §4 lock; reuse `src/shared/ui` primitives
4. Prefer mentor mode (guide file-by-file) unless the user explicitly asks to implement
5. After visual changes: remind user to append §7 Change log (or append if they asked you to update docs)

## Output expectations

- Respect locked dials (quiz answering = calm motion)
- Light and dark parity
- Mobile-first for quiz flows
- Brand “GameMind” strong on home first viewport
- Anti-slop: avoid purple SaaS gradients, generic dashboard chrome, card soup on marketing surfaces
