# 🎵 CommitsMusic

Turn any git repository's history into **music**. One command, zero dependencies.

```
gitmuse ~/my-project
```

Each commit becomes a musical note. The melody is shaped by your commit patterns — late-night commits sound different from morning commits, big refactors hit harder than small fixes.

## Install

```bash
npm install -g gitmuse-cli
```

Requires **Node.js >= 16**. That's it — no Python, no sound fonts, no external tools.

## Usage

```bash
gitmuse                    # current directory
gitmuse ~/my-project       # specific repo
gitmuse --no-anim ~/repo   # audio only, skip animation
```

Set how many commits to use:

```bash
GITMUSE_MAX=100 gitmuse    # default: 200
```

## How it works

```
git log → key detection → commit→pitch mapping → Markov smoothing
  → rhythmic phrasing (5 patterns) → piano synthesis
  → accompaniment (strings, bass, harp, drums) → WAV → playback
```

**Commits control the pitch** — your commit hours directly map to notes
**Algorithmic rhythm** — phrases are grouped by real time gaps, with swing and syncopation
**Piano synthesis** — additive harmonics with ADSR envelope and hammer noise
**Every note validated** — snapped to the detected key, no wrong notes

## What you'll hear

| Instrument | Role |
|-----------|------|
| Piano | Lead melody (from commits) |
| Strings | Harmony + counter-melody |
| Bass | Walking root-fifth pattern |
| Harp | Arpeggiated chords |
| Drums | Kick, snare, hi-hat, clap |

## Try it by cloning this repo

```
git clone https://github.com/Meinianda-L/GitMuse
```

## License

MIT
