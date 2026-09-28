# Stage 3 input and file contracts

## URDF subset

Parsing uses the browser's XML DOMParser and reads direct robot/link/joint children. The parser follows the joint-origin and joint-axis semantics of [urdfdom](https://github.com/ros/urdfdom/blob/master/urdf_parser/src/joint.cpp). XML syntax, identifiers, connectivity, unique parentage, cycles, finite numbers, axis validity, joint bounds, and supported types are checked.

Visual, collision, inertial, and dynamics elements do not affect the kinematic model. No referenced files are loaded. Unsupported features fail explicitly rather than being silently converted into fixed or independent joints.

The parsed tree is immutable application input. Extracting a selected ancestor/descendant path produces the ordered serial model used by the original conversion core. Joint names remain the keys of q; DH row numbers are separate display indices. Nonzero joint lower limits affect the initial live pose, not the reference geometry.

Editing generates a fresh serial model and minimal structural links. Origins use XYZ plus fixed-axis roll/pitch/yaw. Changing a tip invalidates its previous tool offset; changing only a base does not.

## Session JSON versions 1 and 2

Top-level fields:
- `format: "frame-lab-session"`, `version: 1` (legacy) or `version: 2` (new saves)
- `robot`: name, links, supported joints, root, and import notes
- `selection`: base link, tip link, and fixed source tool matrix
- `q`: a finite position for every active joint; bounded joints must lie within limits
- `view`: selected row, focus, mode, construction progress, angular display units, visibility, hidden frames, and optional camera

Version 2 adds `view.workspace`: active task (`model`, `move`, `understand`, `check`) plus independent task layouts. Each layout contains inspector/table/joints visibility, expanded joint controls, overlay toggles, selected/all/none scopes, isolation/fade/whole-chain context, all-parameter/history options, and hidden frame names. Theme is deliberately excluded. Camera focus mode is transient: saving does not make a session reopen with its controls hidden.

Version 1 maps `joint` mode to Move and `construction` to Understand DH. Existing overlays, individual hidden frames, isolation, pose, selected row, and progress survive migration. Legacy frame scopes map to All, and the original all-parameter/history presentation is retained.

Camera state includes projection, position, target, up direction, zoom, and orthographic half-height. Reloading reconstructs the DH model from the source robot and selected path. It does not trust a saved derived DH table.

Loading is atomic with respect to validation: the file is parsed, model/path/view state validated, and DH conversion checked before replacing the working scene. File size and model-size bounds limit accidental oversized imports.

## DH JSON version 1

`format: "frame-lab-dh"`, `version: 1`.

The export is a standalone numerical description, with convention, units, matrix ordering, reference configuration, joint-variable mapping, row parameters, fixed B/E boundary transforms, source transforms, and rigid frame attachments.

For each row:
- revolute/continuous: theta(q) = theta0 + qSign × q
- prismatic: d(q) = d0 + qSign × q
- a and alpha stay fixed

The current-pose table is exported separately from constant parameters. This prevents confusing the evaluated theta/d values with their offsets.

Tests rebuild transforms from the exported constants and boundary matrices and compare them to the independent source kinematics. Exports are not session files; only session JSON restores the UI.

## Visual regression

Display scale is cached per immutable chain and computed from reference URDF geometry at q=0. It has no dependency on live q, selected pair, or construction progress. Arrow lengths, arrowhead dimensions, joint radii, axis-line extents, annotation radii, and schematic-link thickness use that constant scale. Actual link lengths, measured distances, and transforms still follow the model.

The browser test changes each revolute joint through positive/negative angles, changes a prismatic joint, and toggles pair focus while asserting the measured Three.js arrow lengths stay constant.
