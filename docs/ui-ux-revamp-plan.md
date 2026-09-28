# Frame Lab UI/UX revamp plan

**Status: software implementation complete. Local validation and the human-study boundary are recorded in [ux-validation.md](ux-validation.md).**

The design below is retained as the acceptance specification. On narrow screens, the single drawer is docked below the canvas so it cannot cover the mechanism. Stage 4 remains outside this implementation.

## 1. Goal and diagnosis

Make the robot and the current learning task the dominant part of the screen. Keep the app's capabilities, but reveal them when they are useful.

The current interface simultaneously exposes model preparation, physical motion, frame construction, the full DH table, explanatory prose, visibility settings, raw transforms, and numerical verification. Each part is useful; their simultaneous presentation makes it hard to establish a visual hierarchy. Label collision avoidance helps legibility but cannot solve excessive annotation density.

Success means a student can answer “What am I doing now?” and “What should I look at?” without reading three panels.

Prioritize this redesign before adding stage 4 learning features.

## 2. Design principles

1. One primary task and one dominant interaction at a time.
2. The 3D viewport is the workspace; panels support it.
3. Show the selected joint, frame pair, or parameter first. Other detail is an explicit choice.
4. Provide reversible hiding, with an obvious route to restore controls.
5. Preserve model, q, selection, and view preferences when changing tasks.
6. Distinguish physical robot motion from coordinate-frame construction.
7. Keep advanced details available without making them permanent furniture.
8. Avoid adding decorative badges, cards, repeated captions, or floating labels solely to fill space.

## 3. Four task areas, not a mandatory wizard

Use a compact top-level task switch: **Model · Move · Understand DH · Check & export**. Users may jump between them. Loading a ready-made example opens Move; loading a session restores its task area.

| Area | Primary question | Visible by default | Available on demand |
|---|---|---|---|
| Model | What robot and chain am I studying? | Example/import/editor choice, active base and tip, model preview | Source XML, all branches, joint fields, fixed tool offset, import notes |
| Move | How does this mechanism move? | Large robot view, selected joint control, compact joint selector, reset pose | All joint sliders, limits, URDF frames, tool frame, projection controls |
| Understand DH | How is this frame transform constructed? | Selected DH step, selected pair, active parameter, construction controls | Full DH table, all four annotations, URDF comparison, derivation, matrices |
| Check & export | Does the description agree, and how do I keep it? | Verification result, run sweep, save session, export DH | Numerical errors, sampled configurations, boundary transforms, export preview |

The area switch changes presentation and relevant controls, not the mechanism or mathematical convention.

### Model

- Use a dedicated drawer/workspace for importing and editing instead of keeping file buttons permanently beside learning controls.
- Distinguish a pending draft from the applied robot.
- Retain an unfinished editor draft in memory when the drawer closes or the user changes tabs. Do not silently apply it.
- After Apply/Open chain succeeds, return to Move with a short model/chain identification.
- Keep the active model name and base → tip accessible in the compact top bar.
- Put raw source information behind Inspect source.
- Keep parse errors beside the source field and retain the last working scene.

### Move

- Default to the schematic robot, clear joint-type glyphs, and the selected joint's axis.
- Default URDF/DH frame families and dense annotations to hidden here.
- Show one joint slider plus its name, type, value, and unit. A compact joint strip selects another joint.
- Offer Expand all joints for coordinated inspection.
- Keep the tool pose available, but hide matrix entries and numerical residuals by default.
- Allow direct selection through cylinder/carriage glyphs and through the keyboard-accessible joint list.
- Keep the rendering dimensions of glyphs constant as q changes.

### Understand DH

- Keep a compact breadcrumb such as J2 / 5 · F1 → F2 with previous/next controls.
- Offer isolate/fade/whole-chain context. Isolate is the recommended first-time view for this area; retain the user's later choice.
- Show the two selected DH frames and their relevant joint axes.
- Show one active transformation at a time: Rz(θ), Tz(d), Tx(a), Rx(α).
- Show only the active parameter's arc or dimension by default.
- Keep its value, sign, axis, and one explanatory sentence together.
- Offer Show all four parameters for comparison.
- During playback, emphasize the moving ghost frame and the target frame; make historical frames optional and faint.
- Use the explicit label Frame construction. Keep Change robot pose accessible as a collapsed control so students do not confuse animation with physical joint motion.
- Put geometric derivation, axis-case explanations, and zero-parameter explanations behind Why this frame? or a compact disclosure.
- Open the full DH table on demand in a dock/drawer. Clicking a row updates the selected step without leaving the task.
- Boundary transforms must remain accessible and visibly included in the chain equation. Collapsing them must not imply they are zero or irrelevant.

### Check & export

- Consolidate numerical verification and file output in this area.
- Show a concise success state; expand position/orientation/attachment errors when requested.
- Surface a failure or conditioning issue without requiring the user to open the details first.
- Keep the distinction between a current-pose check and a configuration sweep clear.
- Keep Session JSON and DH JSON distinct: one restores the workspace; the other describes the kinematics.
- Preserve meters/radians and the exact DH convention in exports, regardless of theme and display settings.

## 4. Panel behavior and canvas focus

### Desktop layout

- A compact top bar contains model/chain identification, task switch, and a small view/settings menu.
- No permanent left menu after the model is prepared.
- At most one main inspector is expanded by default.
- A collapsed inspector leaves a labeled edge handle, not a nearly invisible chevron.
- A joint-control strip is collapsible independently.
- The table is a secondary dock; do not simultaneously open the full table, derivation, layer settings, and numeric diagnostics on first entry.
- Target at least 65% of the usable desktop width for the viewport in default learning layouts.

### Focus view

Provide a clearly labeled **Canvas focus** action and an optional F shortcut:

- Hide panels, dense prose, the table, and the joint-control strip.
- Preserve the current overlay visibility and selected teaching step.
- Keep a small, unobtrusive strip with model/task context and Exit focus.
- Optionally keep play/pause and step controls in frame-construction mode.
- Escape restores the prior layout. Returning must restore the exact prior panel states.
- Do not enter browser fullscreen automatically.
- Do not activate keyboard shortcuts while typing in input fields or dialogs.

### State preservation

- Closing a panel never resets q, selected row, the construction scrubber, or visibility choices.
- Panel resizing updates the renderer size without refitting or recentering the camera.
- Keep Fit robot and Fit pair explicit actions.
- Remember a camera per task area if necessary to make returning from a close-up predictable; avoid automatic camera jumps on ordinary panel changes.
- Preserve the existing session format through a migration path. If a version 2 format is introduced, accept version 1 and map old joint/construction modes to Move/Understand DH.
- Treat the theme as a local user preference; loading someone else's session should not unexpectedly change it.

## 5. Overlay and information hierarchy

Replace the permanently visible checklist with a compact **Overlays** control.

Organize it by meaning:

- Mechanism: joint glyphs, schematic links, joint axes, travel guides, ground grid.
- Source description: URDF frames and names.
- DH construction: DH frames, common normal, active dimension/angle, ghost frames.
- End effector: source and DH tool frames.

For frames and labels, offer **Selected / All / None** where appropriate. Keep individual overrides in an advanced disclosure. A lightweight Restore task defaults action should undo accidental clutter without changing the robot.

### Default annotation policy

| Element | Move | Understand DH | Check & export |
|---|---|---|---|
| Physical joint glyphs | Visible | Selected pair + chosen context | Visible |
| Schematic links | Visible | Faded or hidden around selection | Visible |
| URDF frames | Hidden | On demand | On demand |
| DH frames | Hidden | Selected pair | On demand |
| Common normal | Hidden | When relevant to the selected step | Hidden |
| Parameter labels | Hidden | Active parameter only | Hidden |
| Historical ghost frames | Hidden | Optional | Hidden |
| Tool frames | Optional | Hidden unless studying the terminal transform | Optional |
| Raw matrices | Hidden | Disclosure | Disclosure |

- Keep x/y/z colors reserved for coordinate axes.
- Identify frame families by labels and line style, not by recoloring axes.
- Use selection color sparingly; avoid coloring every dimension and joint as if all were active.
- Use leader lines only when necessary. If too many would be needed, suppress lower-priority labels instead of drawing a web of connectors.
- Do not hide the active parameter to resolve a collision. Reposition it or offer a camera view along the relevant axis.
- Keep the grid subtle and independently hideable.
- Put an optional joint-symbol legend in Help, rather than adding more permanent text to the viewport.

## 6. Light mode and neutral black dark mode

Add **Light / Black / System** in the view/settings menu. System maps a dark preference to Black. Remember explicit local preference.

The dark theme must use neutral black/gray surfaces, not navy or blue-tinted panels. Small luminance differences should separate regions without thick borders or stacked cards.

Suggested starting tokens, subject to contrast testing:

| Role | Light | Black |
|---|---|---|
| App background | #F5F5F5 | #080808 |
| Panel surface | #FFFFFF | #141414 |
| Elevated control/dialog | #FAFAFA | #1C1C1C |
| Main text | #171717 | #EDEDED |
| Secondary text | #595959 | #B0B0B0 |
| Border/separator | #D6D6D6 | #343434 |
| 3D background | #F2F2F2 | #0B0B0B |
| Subtle grid | #D6D6D6 | #252525 |
| Selection/annotation accent | Dark amber, e.g. #8A5900 | Gold, e.g. #F5C25B |

### Theme the entire workspace

- Use shared semantic tokens for CSS surfaces, text, borders, selection, warnings, and disabled states.
- Synchronize Three.js background, grid, schematic geometry, guides, and annotation materials with the UI theme.
- Theme CSS2D labels, leader lines, HTML dialogs, form controls, hover/focus states, and exports' on-screen previews.
- Set the appropriate browser color-scheme for native form controls.
- Keep the semantic red/green/blue axis convention in both themes, but use shades with adequate contrast on their respective canvas backgrounds.
- Check dark joint index marks against light cylinders and light index marks against dark surfaces.
- Keep success and error states recognizable by text/icons as well as color.
- Avoid a bright flash while restoring the stored theme.
- Honor reduced-motion preferences; theme and panel transitions should be subtle or immediate.

The proposed hexadecimal values are starting points, not a claim of verified contrast. Validate the rendered text and graphical objects before accepting them.

## 7. Responsive and accessible behavior

- Desktop: expandable inspector and optional bottom dock.
- Tablet: at most one overlay drawer; avoid squeezing the viewport between two sidebars.
- Phone: viewport plus a compact task/selection strip, with one bottom sheet/drawer at a time. Do not stack three full desktop panels into a long page.
- Keep all features reachable without relying on hover.
- Support keyboard selection of joints/rows, slider adjustment, disclosure controls, playback, and returning from focus.
- Use visible focus indicators and descriptive labels for icon-only controls.
- Aim for 44 × 44 CSS-pixel touch targets for primary controls.
- Ensure normal text remains readable at 200% enlargement.
- Preserve focus when collapsing a panel; move it to that panel's restore control if its focused child becomes hidden.
- Keep essential errors accessible outside collapsed panels; do not announce continuously changing q or animation values as a stream of live-region messages.

## 8. Implementation sequence

### UX1 — Structure and reversible hiding

Introduce explicit layout state, collapsible inspector/table/joint controls, Canvas focus, and restore handles. Keep all existing mathematical behavior and exports intact. Add keyboard/focus tests and camera-preservation checks.

### UX2 — Task areas and progressive disclosure

Introduce Model, Move, Understand DH, and Check & export. Move existing controls into their appropriate areas. Add task-specific overlay defaults, selected-joint controls, and active-parameter-only construction. Preserve user overrides when returning to an area.

### UX3 — Themes and visual cleanup

Apply shared neutral tokens, Light/Black/System selection, renderer synchronization, quieter grid/link styling, and consistent typography. Verify dialogs, annotations, picking highlights, and disabled controls in both themes.

### UX4 — Accessibility and student validation

Test complete learning tasks on desktop and phone, then correct confusing transitions or hidden controls. Add session migration/round-trip tests for any new saved layout state. Do not expand stage 4 features during this pass.

## 9. Acceptance criteria

### Functional regression

- All existing numerical and import/editor/session/export tests continue to pass.
- Hiding/restoring panels preserves q, selection, construction progress, and camera target.
- Canvas focus always has a visible exit, supports Escape, and restores the preceding layout.
- A user can reach the full DH table, boundary transforms, individual visibility, and diagnostics from any relevant area.
- Session migration preserves the old robot, selected chain, q, and frame visibility.
- Themes affect CSS and 3D content together; no navy surfaces remain in Black mode.
- Marker dimensions remain constant during manual joint motion.
- No page overflow or inaccessible action buttons at representative desktop, tablet, and phone sizes.

### Visual verification

Capture Move, Understand DH, and Check & export in both themes, with ordinary and degenerate-axis examples. Include a selected prismatic joint, negative/zero parameters, a near-parallel case, and open file/editor dialogs.

Check label collisions, low-contrast axes/rails, accidental bright panels in Black mode, and excessive dark annotation boxes in Light mode.

### Learning-task evaluation

With 3–5 robotics students, ask them to:
1. Load a mechanism and move a named joint.
2. Isolate one DH step and explain d versus a.
3. Animate theta without confusing it with a physical extra joint.
4. Hide nonessential content and recover the full table.
5. Verify the description and export it.

Record unnecessary clicks, wrong turns, requests for help, and mistaken interpretations. Use a practical target of completing each basic navigation action in at most three intentional control actions once the robot is loaded. Compare against the current interface; prioritize reduced confusion over a decorative redesign.

## 10. Relation to stage 4

The UX work should stand on its own. Do not use it as an excuse to add every deferred feature.

After the interface is calmer, consider a small optional lesson demonstrating two valid DH frame choices for parallel axes. Then consider short prediction exercises. Modified DH should follow an identified course need. Meshes, URL sharing, extra robot formats, and a broad lesson platform are not prerequisites for this revamp.
