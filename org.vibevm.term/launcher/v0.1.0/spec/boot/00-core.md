# Project boot snippet — `vibe-launcher`

User-owned. `vibe install` / `vibe uninstall` never touch this file.

## About this package

`vibe-launcher` is the trio of Windows-GUI-subsystem binaries
(`vibetree`, `vibeterm`, `vibeframe`) that spawn `vibe` (the host CLI)
without a console flash and report any failure in a native dialog. A
thin shell over the host's `vibe` — the heavy work stays in `vibe`.

It is a `tool` package under the `org.vibevm.term` namespace. The crate
is a one-member Cargo workspace at this directory; the three launchers
are `[[bin]]` targets of that one crate.

## Session boot

Read these files in order: `spec/boot/` (in filename order), then
`spec/WAL.md`, then any relevant `spec/modules/vibe-launcher/PROP-*.md`
for the task at hand. Only after that, start work.

## Memory layers

- **Head** — the human.
- **WAL** — `spec/WAL.md`.
- **Spec** — `spec/**/*.md`, addressable via `spec://<module>/<doc>#<section>`.
- **Code** — `crates/vibe-launcher/src/`.

Conflict resolution priority: **Human > Spec > Tests > Code**. The agent
adds a `<!-- REVIEW: ... -->` marker when it disagrees with a spec
rather than silently deviating.
