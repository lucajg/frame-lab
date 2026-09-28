# Frame Lab — URDF to DH

A local, browser-only educational app. Stages 1–3 are implemented: verified kinematics, an interactive 3D teaching surface, URDF import, a serial-chain editor, sessions, and DH export. The UX revamp adds task-based navigation, reversible panels, neutral Light/Black/System themes, cursor-centered zoom, and camera-facing tool markers. No ROS installation, account, or external asset service is required.

## Run locally

A project-local Node 22 runtime is installed in `.tools/node` on this machine.

```sh
./run.sh dev
```

Open **http://127.0.0.1:5173/**. The server binds to localhost only. Stop it with Ctrl+C.

With a normal Node installation (Node >=22.12):

```sh
npm ci
npm run dev
```

## Verification

```sh
./run.sh test          # mathematical, URDF, editor, and session unit tests
./run.sh build         # strict TypeScript checking + production build
./run.sh test:browser  # real WebGL and browser interaction tests
```

Browser tests use local Google Chrome at `/opt/google/chrome/chrome` if available. Set `CHROME_PATH` for another executable, or install Playwright's browser with `npx playwright install chromium`.

The unit tests cover the four axis relationships, analytic planar kinematics, eight built-in mechanisms at 100 poses each, 120 random mixed chains at ten poses each, source-frame attachments, construction interpolation, input validation, branched URDF import, RPY editor round trips, session validation, and reconstruction from exported parameters.

Browser tests cover actual rendering, all example sweeps, joint sliders, pair isolation, construction playback, visibility, cameras, desktop/mobile layouts, constant marker dimensions during joint motion, imports and errors, editor changes, and downloaded session/export round trips. Additional UX tests cover task state, reversible panels, focus/keyboard navigation, 200% text, Light/Black/System, draft preservation, v1/v2 sessions, cursor zoom in both projections, camera-facing tool rings, and phone/tablet workflows. Screenshots go in ignored `test-results/`.

## Explore a lesson

1. In **Move**, select a joint in the top strip (or click its cylinder/carriage), then adjust its slider. Expand all joints if needed.
2. Open **Understand DH**. The selected pair is isolated by default. Use **Fit pair** for a close-up.
3. Select Rz(θ), Tz(d), Tx(a), or Rx(α), then play or step through its frame construction. Only the active parameter is annotated unless **Show all four parameters** is enabled.
4. Choose **Fade other joints** or **Whole chain** for context. Open **Why this frame?** for the geometric explanation.
5. Open **Base & tool transforms** to see B and E, which complete the chain equation.
6. Use **Check & export** to compare the current pose, sweep 150 configurations, inspect samples, or save/export.
7. In **Model**, try **Rotate, slide, rotate** to see d rather than θ contain joint motion.

**View & theme** controls overlays, per-frame overrides, projection, angular units, and Light / Black / System themes. Theme follows the OS by default and explicit choices are saved locally. Each task remembers its own overlay and panel preferences.

**DH table**, **Joint controls / Robot pose**, and **Show/Hide details** independently open or close panels. On phones/tablets, one details panel is shown at a time. **Canvas focus** (or F) hides panels; **Escape** restores the previous layout. Shortcuts do not activate in fields or dialogs. The scene toolbar spans the full workspace and stays in place when details are toggled. Robot and chain names appear beside Model, separate from the Frame Lab branding. Changing panels does not move the camera or reset the robot.

Drag to orbit, right-drag to pan, and scroll at the pointer to zoom. Both perspective and orthographic views support cursor-centered zoom. Looking along θ or α changes the viewing direction while keeping world Z as the orbit-up axis, so dragging continues to behave consistently. Camera snaps clear residual orbit motion. Click or double-click a joint symbol to select it; a small screen-space margin helps with narrow or distant joints, and drags are ignored by selection. Clicking an already selected joint preserves construction progress. On touchscreens, use one finger to orbit and two to pan/zoom. The DH end-effector ring faces the camera on every render; its position still comes from DH forward kinematics.

Internal units are meters and radians. The main display can show angular values in degrees. Construction playback moves a ghost coordinate frame, not the physical mechanism.

## Compare your own DH parameters

In **Check & export**, choose **Compare custom DH**. The editor starts with the app’s computed values and shows each reference value below your input. Enter values at **q = 0**, or paste one row per moving joint in **theta, d, a, alpha** order (no headers). Lengths use meters; choose radians or degrees for the parameter angles. Changing angle units converts existing values.

The comparison uses **standard DH** (`Rz(theta) Tz(d) Tx(a) Rx(alpha)`), with the source joint order and types. Choose a +1 or −1 joint sign where needed. Fixed connections are captured by the parameters and boundary transforms. Under **Base & tool transforms**, enter your own B and E if your DH frames differ from the app’s; both descriptions must reach the same source tool from the same base.

**Compare 152 configurations** checks the current pose, zero pose, both joint-limit endpoints, and 148 additional deterministic samples (seed 3419). Continuous joints use the displayed range. Results report current and maximum position/orientation errors, plus every sample and its source joint values. Both errors must be within **1e−7 m / 1e−7 rad**. Different parameter tables can agree; matching a single pose is insufficient, and sampled agreement is numerical evidence rather than a mathematical proof. Modified DH is not supported.

Draft inputs survive closing the dialog and switching tasks. Loading another robot resets them; comparison drafts are not included in saved sessions. Results are invalidated after edits or reopening, so they cannot silently describe an old pose.

## Import your URDF

In **Model**, click **Import URDF**, paste expanded XML or choose a local `.urdf`/`.xml` file, then click **Read URDF**. Choose a base link and descendant tip and click **Open selected chain**.

- The robot must be a connected tree. Branches are retained for later chain selection and session saving.
- Revolute, continuous, prismatic, and fixed joints are supported.
- Fixed joints preserve their transformations without creating movable DH rows.
- An internal base is supported; results are relative to that selected base.
- A fixed-only path or a single link is supported and has no movable DH rows.
- Missing visual meshes do not block import; meshes are never requested.
- Missing origins default to identity; missing moving-joint axes default to positive x.
- Revolute/prismatic joints require a limit element. Omitted lower/upper attributes default to zero, matching URDF parser semantics. Effort/velocity and dynamics are not used by this kinematics app.
- The live pose starts at zero clamped to each joint's bounds. The DH reference configuration remains q=0 even when zero lies outside the motion limits.
- Unsupported Xacro expressions, mimic coupling, floating/planar joints, quaternion origins, disconnected models, and closed loops produce explicit errors.
- File size limit: 2 MB. Model limit: 500 joints; interactive selected chain: 100 joints.

Try [the branched test URDF](tests/fixtures/branched.urdf), selecting `base → tool`.

## Edit a serial chain

In **Model**, click **Edit chain**. Edit the current chain or **Start new chain**. Add, remove, reorder, or change joint types; edit origins, axes, bounds, and a fixed tool offset.

The editor uses **meters and radians**, explicitly labeled, regardless of the main viewport's angular display setting. Parent/child links are generated automatically as `base → link_1 → link_2 → …`. Applying edits creates a serial model from the selected chain; other branches are not included. Invalid edits leave the working model unchanged. Unapplied drafts survive closing the dialog and switching its tabs; applying a model returns to Move.

The fixed tool offset belongs to the selected tip. Selecting another base while keeping that tip preserves the offset. Selecting a different tip resets the offset.

## Save, restore, and export

**Check & export → Save / load session → Save session JSON** preserves the robot tree, selected base/tip, fixed tool offset, joint positions, row selection, construction step, angle units, visibility, camera, active task, and per-task layouts. New saves use version 2; version 1 sessions are migrated automatically. Theme remains a local preference and is not imported. Reload the downloaded JSON to continue. Session input is validated before changing the working scene.

**Export DH → Download DH JSON** includes:
- the exact standard-DH equation and units;
- constant theta0, d0, a, alpha values;
- source joint/link mappings, variable definitions, signs, and limits;
- fixed base and tool transforms;
- source joints, fixed source tool offset, and frame attachments;
- current joint values and evaluated table rows.

Exports always use meters/radians and row-major matrices acting on column vectors. A DH export is a kinematic description; a session file is the reloadable workspace format.

Files are processed in the browser and downloaded locally. Nothing is uploaded, and no site has been published.

## Joint symbols

Revolute and continuous joints use cylinders whose height follows the URDF motion axis, with an end-cap index that rotates with q. Prismatic joints use a carriage that translates along a stationary two-rail guide; stops show supplied joint limits. Fixed joints use small box connectors. These are schematic teaching symbols, not CAD or collision geometry. Their dimensions do not change with q or selection.

The [UX revamp plan](docs/ui-ux-revamp-plan.md) is implemented. See [implementation and validation notes](docs/ux-validation.md), including the remaining human learning study. Stage 4 learning features remain deferred.

## Marker-size fix

Previously, each redraw derived marker sizes from the **current-pose** bounding box and, in pair focus, the current frame separation. Folding or extending the robot therefore changed axes, frame arrows, joint markers, and annotation radii.

Marker dimensions now come from the immutable **q=0 reference geometry** and stay the same across joint motion and focus changes. Camera perspective can still change apparent screen size naturally. The browser regression checks actual arrow geometry through multiple revolute and prismatic poses.

## Architecture and remaining scope

See [the mathematical design](docs/kinematics.md) and [stage 3 formats](docs/stage3.md).

- `src/core/math.ts`: pure vector and transform operations.
- `src/core/urdf.ts`: serial model validation and independent URDF FK.
- `src/core/dh.ts`: DH geometry, conversion, evaluation, construction, and diagnostics.
- `src/core/robot.ts`: XML parsing, tree/path validation, editable chain model.
- `src/core/session.ts`: validated session format and complete DH exports.
- `src/core/workspace.ts`: task defaults, validated presentation preferences, version 1 migration.
- `src/theme.ts`: renderer palettes synchronized with CSS theme tokens.
- `src/core/display.ts`: pose-independent marker sizing.
- `src/core/examples.ts`: built-in mechanisms.
- `src/view.ts`: 3D geometry, picking, annotations, camera state.
- `src/files-ui.ts`: local file and chain editor workflows.
- `src/main.ts`: primary interface and shared application state.

Still deferred: multiple valid DH frame choices, modified DH, Xacro expansion, mimic joints, floating/planar joints, closed-loop solving, meshes, and publication.

Production files are generated in `dist/` for later static hosting. Optional page tools are feature-detected; their contract is exercised with a test registry, not a live agent-enabled browser service.
