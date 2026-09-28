# Kinematic conventions and construction

## What is equivalent?

The output represents the same moving serial mechanism, not just one matching pose:

`T_URDF(q) = B × A_1(q_1) × ... × A_n(q_n) × E`

B is a fixed transform from the input base to DH frame F0. E is a fixed transform from the final DH frame to the selected tool. Neither is silently discarded. Fixed URDF joints are included in the geometry without adding degrees of freedom.

Meshes, inertias, and collision shapes do not participate. Source frames and DH frames can differ while remaining rigidly attached to the same links. No virtual movable joints are introduced.

## Matrix convention

Right-handed frames, column vectors, row-major arrays. Transform T maps coordinates expressed in its child frame to its parent frame.

URDF joint semantics:
`T_parent_child(q) = T_origin × T_motion(axis, q)`

The axis is expressed in the joint frame. RPY uses fixed axes:
`T_origin = Trans(xyz) × Rz(yaw) × Ry(pitch) × Rx(roll)`

Standard DH:
`A_i = Rz(theta_i) × Tz(d_i) × Tx(a_i) × Rx(alpha_i)`

Joint i acts about/along z_(i-1). For revolute and continuous joints, theta = theta0 + q. For prismatic joints, d = d0 + q. All chosen DH z axes follow the positive URDF axes, so the sign is +1. Alpha and a are constant. Theta/d retain their reference offsets.

The equation and indexing define the convention; modified DH is not implemented.

## Deterministic frame choices

Compute all input joint frames and axes once at q=0 (the URDF reference configuration, even if zero is outside a configured motion limit).

F0:
- origin at the first active joint's reference origin;
- z along its positive axis;
- x chosen by projecting the least-aligned Cartesian basis vector onto the plane perpendicular to z (ties keep x, y, z order);
- y = z × x.

For each pair of consecutive active joint axes:
- **Skew:** find closest points on the infinite directed axes. x points from the previous-axis foot toward the next-axis foot. The new origin is the next-axis foot.
- **Intersecting:** new origin is the intersection. a = 0; x follows normalized z_previous × z_next.
- **Parallel or antiparallel:** choose the normal through the current joint's reference origin, projected onto the next axis. x points toward the next axis.
- **Coincident:** use the current joint's reference origin and preserve the previous transverse x direction.
- In all cases, the new z follows the next active joint's axis.

The terminal frame Fn is at the last active joint's reference origin, with the same z and transverse x as the preceding DH frame. The last row still carries the last joint's motion. The arbitrary remaining tool transform is E. In the planar 2R example, the final arm length therefore appears in E, not a_2; this is intentional and explained in the lesson.

For each relative reference frame matrix H:
- theta0 = atan2(H_10, H_00)
- alpha = atan2(H_21, H_22)
- d0 = H_23
- a = cos(theta0) H_03 + sin(theta0) H_13

Conversion reconstructs each relative transform and rejects a numerically unstable construction rather than silently displaying a wrong table.

## Why equivalence extends beyond the reference pose

Let L_i(q) be the URDF pose of the child link after active joint i, and X_i = inverse(L_i(0)) F_i(0). Store X_i once. It is a fixed frame attachment to that rigid link.

The construction aligns the preceding DH z-axis with joint i. Conjugating the URDF joint motion into that frame yields Rz(q_i), or Tz(q_i) for a prismatic joint. With the chosen constant attachments, the relative transform is the standard-DH row evaluated at q_i. Therefore F_i(q) = L_i(q) X_i by induction over the serial chain. Multiplying the fixed endpoint transform E gives the original tool pose.

The implementation tests this local attachment identity at every frame, as well as tool agreement. Sampling is numerical evidence of the implementation's correctness, not a substitute for this structural argument.

## Numerical policy

- Double precision, meters and radians internally.
- Joint axes are normalized; nonfinite or effectively zero axes are rejected.
- Parallel threshold: norm(cross(unit axes)) <= 1e-12.
- Intersection/coincidence distance threshold: 1e-10 m.
- Near-parallel warning: cross-product norm between 1e-12 and 1e-5.
- Each reference row reconstruction must agree within 1e-7 m and 1e-7 rad.
- Live/sweep acceptance uses 1e-7 m and 1e-7 rad for both tool and rigid frame attachments.
- The near-parallel unit stress fixture allows 1e-6 m for cancellation at distant origins; the built-in sweep still passes the tighter live threshold.
- Position error is Euclidean translation distance. Orientation error uses atan2 of the skew norm and trace-derived cosine, including the 180° case.

These absolute tolerances target ordinary meter-scale teaching examples. Extremely small/large robots and nearly degenerate geometry need deliberate conditioning policies for geometry far outside the intended teaching scale. The code never recomputes frames as q changes. Near-parallel origins can legitimately be far from the physical robot; initial camera fitting uses the physical chain, and Fit all includes DH origins.

## Educational rendering

- Source link connectors are schematic, not CAD geometry or DH distances.
- Standard red/green/blue arrows always mean x/y/z.
- The gold normal connects the reference axis feet transported with their rigid link.
- Construction postmultiplies each elementary transform on a moving ghost frame.
- Theta arcs use the starting frame's x–y plane; alpha arcs use the intermediate y–z plane after Tx.
- Translation annotations show signed displacements, including zero.
- Past construction axes are faint; the current ghost and target DH frames remain emphasized.
- Isolation changes visibility only, never the kinematics.
- Physical joint sliders can set the pose being explained. During construction playback only the ghost frame moves.

## References

- [ROS URDF joint/link semantics](https://docs.ros.org/en/fuerte/api/urdf_interface/html/index.html)
- [CMU standard-DH geometry](https://www.cs.cmu.edu/~rapidproto/mechanisms/chpt4.html)
- [Huczala et al., automated conversion between kinematic representations](https://arxiv.org/abs/2204.02629)

## Input and rendering integration

Expanded URDF trees, serial-chain editing, local sessions, and complete DH export are implemented in stage 3. See [the file contracts](stage3.md). Visual marker sizes use fixed reference geometry, so manual joint motion never rescales frame axes or markers.
