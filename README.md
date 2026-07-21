# vibevm-term

The **vibevm terminal products** — a sibling repository to
[`vibevm`](https://github.com/vibevm/vibevm) holding the **closed-source GUI
products** of the vibevm umbrella:

- **vibeterm** — the complex multi-tab terminal workspace (Electron + SolidJS).
- **vibeframe** — the simple single-window terminal frame (VibeTree's host).
- **vibe-launcher** — the GUI launchers (`vibetree`/`vibeterm`/`vibeframe`
  `.exe`) that spawn `vibe` without a console flash.
- **term-common** — shared TypeScript helpers (arg/keymap/packaging) and the
  normative contracts shared by all three (the control protocol, the discovery
  file, the OSC 7773 icon swap, env markers, the version-manager).

## Hybrid umbrella model

vibevm splits along **licensing**, not along integration:

- **vibevm (the open-source host)** — the package manager, `vibe` CLI,
  `vibe tree`, the version manager, the resolver, the install pipeline.
- **vibevm-term (this repo)** — the closed-source GUI products.

The two integrate **seamlessly**: `vibe.exe` (host) still spawns `vibeterm` /
`vibeframe` / `vibe tree` when those are available on `PATH`. Each product
publishes itself there through its own version-manager
(`vibeterm self install`, etc.), independent of `vibe self update`.

## Layout

```
vibevm-term/
└── org.vibevm.term/                 <- the namespace (a vibe registry root)
    ├── common/v0.1.0/               <- term-common (shared JS + vvm port + contracts)
    ├── launcher/v0.1.0/             <- vibe-launcher (Rust workspace)
    ├── vibeterm/v0.1.0/             <- the complex terminal
    └── vibeframe/v0.1.0/            <- the simple frame
```

Each package carries its own `vibe.toml`, its own `spec/` tree, its own
`vibedeps/` (vendored static deps — AI-Native Rust stack + redbook), and its
own `WAL.md`. The AI-Native Rust discipline is adopted from birth via
`requires.packages` (static-transitive), as in
`packages/org.vibevm.fractality/`.

## Consuming from the host

This repo is a **local-directory vibe registry** (PROP-002 §2.2.2). A project
that depends on `org.vibevm.term/*` resolves it from disk — add to
`~/.vibe/registry.toml`:

```toml
[[registry]]
name = "vibevm-term"
url = "file:///C:/Users/olegc/git/v/vibevm-term"
```

…and reference the packages in the consuming project's `vibe.toml`:

```toml
[requires.packages]
"tool:org.vibevm.term/term-common" = "^0.1.0"
"app:org.vibevm.term/vibeterm"     = "^0.1.0"
"app:org.vibevm.term/vibeframe"    = "^0.1.0"
"tool:org.vibevm.term/launcher"    = "^0.1.0"
```

## Session boot

Read `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` (identical) at the repo root,
then each package's own `spec/boot/INDEX.md` for the package you are working
on. The boot model is PROP-009 (pure file-reading, nothing executes).
