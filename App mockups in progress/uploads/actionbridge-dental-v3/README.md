# ActionBridge Dental v3 — design source

Source files for the "Dental v3" page of the ActionBridge design canvas (Claude Design `.dc.html` format).

## Files
- `Dental-App.dc.html` — the interactive prototype. All screens, the state machine, the
  sample case (Jordan) and the cost calculation (`calc()`) live in its `<script type="text/x-dc">`.
  The `scene` prop picks a starting state; `width`, `height`, `animate` and `saveFailsOnce` are also props.
- `Dental-Orb.dc.html` — the animated orb component (imported by the prototype).
- `D-*.dc.html` — state artboards. Each one imports `Dental-App` with a fixed `scene`.
- `D-Auth-Handoff.dc.html` — annotated sign-in handoff (four frames).
- `Dental-Components.dc.html` — component and state inventory.
- `Dental-Handoff.dc.html` — engineering handoff (screen map, states, block contract, permissions, calculation check).
- `canvas.json` — layout for this page only (positions, sizes, titles, row notes).

## Running it
These files need the Design canvas runtime (loaded as `support.js`), which is part of the
Claude Design artifact type and is not included here. To view them, open the canvas in Claude,
or ask Claude to port the screens into the Expo app (`actionbridge-mobile`).

Everything is simulated: one synthetic case, no network calls, no real sign-in.
