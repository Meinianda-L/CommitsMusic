# 🎵 CommitsMusic

Turn any git repository's history into **music** with a beautiful TUI.

```
commitsmusic ~/my-project
```

Each commit becomes a musical note. The melody is shaped by your commit patterns — late-night commits sound different from morning commits, big refactors hit harder than small fixes.

## Install

```bash
npm install -g commitsmusic
```

Requires **Node.js >= 16**.

## Usage

```bash
commitsmusic                  # current directory
commitsmusic tui              # TUI: browse and pick repos
commitsmusic ~/my-project     # specific repo
commitsmusic -50 ~/repo       # last 50 commits
commitsmusic -noan ~/repo     # audio only, skip animation
```

## How it works

```
git log → key detection → commit→pitch mapping → Markov smoothing
  → rhythmic phrasing (5 patterns) → piano synthesis
  → accompaniment (strings, bass, harp, drums) → WAV → playback + animation
```

**Commits control the pitch** — your commit hours directly map to notes  
**Algorithmic rhythm** — phrases are grouped by real time gaps, with swing and syncopation  
**Piano synthesis** — additive harmonics with ADSR envelope and hammer noise  
**Every note validated** — snapped to the detected key, no wrong notes  
**TUI browser** — `commitsmusic tui` scans your filesystem, pick repos with arrow keys

## What you'll hear

| Instrument | Role |
|-----------|------|
| Piano | Lead melody (from commits) |
| Strings | Harmony + counter-melody |
| Bass | Walking root-fifth pattern |
| Harp | Arpeggiated chords |
| Drums | Kick, snare, hi-hat, clap |

## Try it

```bash
git clone https://github.com/Meinianda-L/CommitsMusic
cd CommitsMusic
commitsmusic .
```

## License

MIT
