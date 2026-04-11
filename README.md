# Dashy's TD: Final Stand

A browser-based tower defense game built with vanilla JavaScript, Canvas 2D, and Web Audio API. No dependencies, no build step — open `index.html` and play.

## How to Play

Enemies march along a path toward the exit. Place towers on the grass to destroy them before they get through. You lose lives each time an enemy escapes. Survive all 20 waves to win.

- **Place a tower**: Select one from the sidebar, then click a grass tile
- **Upgrade / Sell**: Click a placed tower to open the info panel
- **TNT**: Select TNT from the bottom of the sidebar, then click any path tile — it detonates after a short fuse
- **Pause**: Press `P`
- **Cheat codes**: Press `C` during gameplay to enter a code (see below)
- **Speed**: Click the speed button to cycle 1×/2×/3×/4×

## Towers

| Tower | Cost | Notes |
|---|---|---|
| Ninja | 100g | Very fast, medium damage |
| Teddy | 125g | Close-range AoE squash |
| Knight | 150g | High damage, slow attack |
| Archer | 200g | Long range, fast fire |
| Frost | 250g | Slows enemies on hit |
| Wizard | 400g | Medium range, magical |
| Cannon | 600g | Explosive, high damage |
| Dino | 850g | Fast melee chomps |
| Demon | 1200g | Rapid-fire blasts |
| Elemental | 1800g | Slow, massive AoE |

Towers can be upgraded (2× HP, 2× cost) or sold (50% refund).

## Enemies

- **Scout** — fast and weak
- **Goblin** — heals nearby enemies
- **Heavy** — shoots projectiles back at towers
- **Dragon** — breathes fire that destroys towers
- **Blue Dragon** — harder variant, appears from wave 7

## Cheat Codes

Press `C` during gameplay to open the cheat prompt.

| Code | Effect |
|---|---|
| `money` | +9999 gold |
| `heart` | 999 lives |
| `20` | Jump to wave 20 |
| `bluedragon` | Fill current wave with blue dragons |
| `ninja` | Line the entire path with max-level ninjas |

## File Structure

```
index.html   — game shell, canvas, overlay screens, sidebar
style.css    — dark fantasy theme, layout, UI components
game.js      — all game logic (~1200 lines)
```

`game.js` is organized roughly as:

- **Lines 1–50** — constants, global state
- **Lines 51–170** — procedural audio (Web Audio API, no sound files)
- **Lines 172–457** — `Enemy` class (5 types with special abilities)
- **Lines 459–706** — `Tower` class (10 types, targeting, rendering)
- **Lines 708–780** — `Projectile` and `EnemyProjectile` classes
- **Lines 794–837** — leaderboard (localStorage, top 20)
- **Lines 839–932** — game engine (`startGame`, `gameLoop`, `startWave`)
- **Lines 934–1092** — map generation and cached background rendering
- **Lines 1094–end** — UI initialization, event handlers, cheat codes, TNT, scaling
