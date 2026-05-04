# Car Game

Retro Ridge Rally is a retro 3D browser car game built as a static GitHub Pages site. Players only need the link.

## Play Locally

From this folder, start a simple local server:

```bash
python3 -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

## Publish On GitHub Pages

1. Create a public GitHub repository named `car-game`.
2. Add these project files to the repository.
3. Commit and push to the `main` branch.
4. In GitHub, open `Settings` → `Pages`.
5. Set `Source` to `Deploy from a branch`.
6. Set `Branch` to `main` and folder to `/root`.
7. Save.

Your playable link will look like:

```text
https://YOUR-GITHUB-USERNAME.github.io/car-game/
```

## Controls

- Arrow keys or WASD: steer, accelerate, brake
- Space or Shift: boost
- P or Escape: pause
- Touch buttons work on phones and tablets

## Files

- `index.html` is the page GitHub Pages serves.
- `styles.css` handles the retro HUD and screen overlays.
- `src/game.js` contains the Three.js game.
- `src/game.js` imports the pinned Three.js runtime from jsDelivr.

## Third-Party Code

This project uses Three.js from jsDelivr:

```text
https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js
```
