import {
  applyBoneRotation,
  applyBoneTwist,
  resetAllBones,
  resetMorphs,
  setMorph,
} from './rig.js';

// Procedural skeletal animation for Lilith v5. The rig is a Koikatsu-style
// skeleton, so motions are composed from a small set of root-space axes instead
// of per-bone animation clips.
//
// Walk cycle follows the classic contact -> down -> passing -> up structure.
// Phase 0 is left heel strike; the right leg is offset by half a cycle. The
// stance phase lasts 60% of the cycle, so there is a short double-support
// window around each contact.

const TAU = Math.PI * 2;

// All angles are degrees in character root space:
//   hip   < 0 swings the thigh forward, > 0 extends it backward
//   knee  > 0 bends the lower leg backward
//   ankle < 0 lifts the toes (dorsiflexion), > 0 points them down
//   toe   < 0 keeps the toes flat while the heel lifts
// Stance segments are interpolated linearly: a planted foot has to travel
// backward at a steady rate or the walk reads as skating.
const LEG_KEYS = [
  { p: 0.00, hip: -23, knee: 8, ankle: -8, toe: 0, linear: true },   // contact, heel strike
  { p: 0.10, hip: -16, knee: 16, ankle: 2, toe: 0, linear: true },   // down, weight accepted
  { p: 0.32, hip: -1, knee: 5, ankle: 0, toe: 0, linear: true },     // passing, body over foot
  { p: 0.46, hip: 10, knee: 4, ankle: 5, toe: 0, linear: true },     // up, heel begins to lift
  { p: 0.58, hip: 18, knee: 26, ankle: 16, toe: -14 },               // toe-off
  { p: 0.68, hip: 10, knee: 38, ankle: 0, toe: 0 },                  // early swing
  { p: 0.78, hip: -12, knee: 30, ankle: -8, toe: 0 },                // mid swing, thigh drives forward
  { p: 0.90, hip: -20, knee: 12, ankle: -10, toe: 0 },               // late swing, knee extends
  { p: 1.00, hip: -23, knee: 8, ankle: -8, toe: 0 },                 // contact again
];

// Running gait: longer reach, deeper knee fold, and a short flight phase.
const RUN_KEYS = [
  { p: 0.00, hip: -30, knee: 26, ankle: -6, toe: 0, linear: true }, // ball strike
  { p: 0.08, hip: -22, knee: 34, ankle: 0, toe: 0, linear: true },  // load
  { p: 0.22, hip: -6, knee: 18, ankle: 2, toe: 0, linear: true },   // mid-stance
  { p: 0.36, hip: 18, knee: 24, ankle: 16, toe: -14 },   // drive
  { p: 0.46, hip: 26, knee: 52, ankle: 20, toe: -18 },   // toe-off
  { p: 0.56, hip: 16, knee: 78, ankle: 0, toe: 0 },      // early swing
  { p: 0.70, hip: -6, knee: 80, ankle: -12, toe: 0 },    // mid swing
  { p: 0.84, hip: -26, knee: 56, ankle: -14, toe: 0 },   // late swing
  { p: 0.94, hip: -34, knee: 34, ankle: -8, toe: 0 },    // reach
  { p: 1.00, hip: -30, knee: 26, ankle: -6, toe: 0 },
];

const smooth = (t) => t * t * (3 - 2 * t);

function sampleGait(keys, phase) {
  const p = ((phase % 1) + 1) % 1;
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].p) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const raw = (p - a.p) / (b.p - a.p);
  const t = a.linear ? raw : smooth(raw);
  return {
    hip: a.hip + (b.hip - a.hip) * t,
    knee: a.knee + (b.knee - a.knee) * t,
    ankle: a.ankle + (b.ankle - a.ankle) * t,
    toe: a.toe + (b.toe - a.toe) * t,
  };
}

// Actions are fixed keywords sent through ctx.motion; the pet keeps using the
// boolean context (walking / talking / sleeping) and never sets motion.
const ACTION_MODES = new Set(['run']);

export function createPetAnimator(rig, options = {}) {
  if (!rig || !rig.hasSkeleton) return null;

  const model = options.model || '';
  const deepseek = model === 'deepseek_v4';
  // DeepSeek rests in a wide A-pose with the arms pointing along the X axis, so
  // the upper arms need a deeper drop and the forward/back swing happens around
  // the vertical (Y) axis instead of X. Its skirt is also much wider, so the
  // hands need a shallower drop to hang clear of it.
  const sideArms = deepseek;
  const armDropBase = deepseek ? 44 : 40;

  // Crouching and landing bend the knees, which lifts the feet away from the
  // root. Track the lowest foot point from the rest pose so the root can be
  // lowered by the same amount and keep the soles on the floor.
  const footBones = ['左足首', '右足首', '左つま先', '右つま先']
    .flatMap((name) => rig.bones.get(name) || []);
  let restFootY = Infinity;
  if (footBones.length) {
    rig.root.updateMatrixWorld(true);
    for (const bone of footBones) {
      const v = bone.getWorldPosition(bone.position.clone());
      rig.root.worldToLocal(v);
      if (v.y < restFootY) restFootY = v.y;
    }
  }

  const boneNames = [...rig.bones.keys()];
  // Skirt chains are named スカート_<depth>_<chain>, so the 16 swing roots are
  // the depth-0 bones, not every depth of chain 0.
  const skirtRoots = boneNames.filter((name) => /^スカート_0_\d+$/.test(name));
  const tailRoots = deepseek ? boneNames.filter((name) => /^尾巴(001)?$/.test(name)) : [];
  const hairRoots = deepseek
    ? boneNames.filter((name) => /^(アホ毛1|後髪1[LR]?|側髪1[LR])$/.test(name))
    : boneNames.filter((name) => (
        name === '前发Root'
        || name === '刘海中'
        || name === '侧发L'
        || name === '侧发R'
        || /^馬尾1-0[LR]$/.test(name)
        || /^BackHair_[A-Z]{2}_0_1$/.test(name)
        || name === '蝴蝶结RootL'
        || name === '蝴蝶结RootR'
        || name === '丝带upL'
        || name === '丝带upR'
        || name === '丝带downL'
        || name === '丝带downR'
      ));

  const acc = new Map();
  const add = (name, x, y, z) => {
    if (!rig.bones.has(name)) return;
    let value = acc.get(name);
    if (!value) {
      value = { x: 0, y: 0, z: 0 };
      acc.set(name, value);
    }
    value.x += x;
    value.y += y;
    value.z += z;
  };

  let time = 0;
  let walk = 0;
  let talk = 0;
  let sleepLevel = 0;
  let dragLevel = 0;
  let heldLevel = 0;
  let heldTime = 0;
  let jumpCrouchLevel = 0;
  let jumpAirLevel = 0;
  let jumpLandLevel = 0;
  let patLevel = 0;
  let sitLevel = 0;
  let motion = null;
  let motionBlend = 0;
  let blinkValue = 0;
  let blinkPhase = -1;
  let blinkTimer = 2 + Math.random() * 3;

  function update(dt, ctx = {}) {
    time += dt;

    const requested = typeof ctx.motion === 'string' ? ctx.motion : null;
    if (requested !== motion) {
      motion = requested;
      motionBlend = 0;
    }
    const actionTarget = ACTION_MODES.has(motion) ? 1 : 0;
    motionBlend += (actionTarget - motionBlend) * Math.min(1, dt * 6);
    const act = motionBlend;
    const run = motion === 'run' ? act : 0;

    const sitTarget = ctx.sitting && !ctx.dragging && !ctx.falling ? 1 : 0;
    sitLevel += (sitTarget - sitLevel) * Math.min(1, dt * 7);
    const walkTarget = ctx.walking && !sitTarget ? 1 : 0;
    const talkTarget = ctx.talking ? 1 : 0;
    const sleepTarget = ctx.sleeping ? 1 : 0;
    const dragTarget = (ctx.dragging || ctx.falling) ? 1 : 0;
    // Only a real drag gets a carried pose; falling keeps the old spread-arm
    // flail, so the two share dragLevel but not heldLevel.
    const heldTarget = ctx.dragging ? 1 : 0;
    const patTarget = Math.min(1, Math.max(0, Number(ctx.pat) || 0));

    walk += (walkTarget - walk) * Math.min(1, dt * 5.5);
    talk += (talkTarget - talk) * Math.min(1, dt * 8);
    sleepLevel += (sleepTarget - sleepLevel) * Math.min(1, dt * 4);
    dragLevel += (dragTarget - dragLevel) * Math.min(1, dt * 6);
    heldLevel += (heldTarget - heldLevel) * Math.min(1, dt * 7);
    patLevel += (patTarget - patLevel) * Math.min(1, dt * 7);

    if (ctx.dragging) heldTime += dt;
    else heldTime = 0;
    const heldStyle = ctx.heldStyle === 'waist' ? 'waist' : 'hand';
    const handHeld = heldLevel * (heldStyle === 'hand' ? 1 : 0);
    const waistHeld = heldLevel - handHeld;
    // Which screen side the raised arm is on, so the torso and the root roll in
    // app.js both bend away from it.
    const heldLean = sideArms ? 1 : -1;
    // Stay limp in the pickup pose for a couple of seconds, then get fed up and
    // start kicking; the tantrum is at full strength about two seconds later.
    const struggle = heldLevel * Math.min(1, Math.max(0, (heldTime - 2.2) / 2));

    const jumpPhase = ctx.jumpPhase || 'idle';
    const jumpT = Number(ctx.jumpT) || 0;
    const crouchTarget = jumpPhase === 'crouch' ? smooth(Math.min(1, jumpT / 0.12)) : 0;
    const airTarget = jumpPhase === 'air' ? Math.min(1, jumpT / 0.06) : 0;
    const landTarget = jumpPhase === 'land'
      ? Math.min(1, jumpT / 0.05) * (1 - smooth(Math.min(1, jumpT / 0.22)))
      : 0;
    jumpCrouchLevel += (crouchTarget - jumpCrouchLevel) * Math.min(1, dt * 22);
    jumpAirLevel += (airTarget - jumpAirLevel) * Math.min(1, dt * 24);
    jumpLandLevel += (landTarget - jumpLandLevel) * Math.min(1, dt * 24);

    blinkTimer -= dt;
    if (blinkPhase < 0 && blinkTimer <= 0 && sleepLevel < 0.6) {
      blinkPhase = 0;
      blinkTimer = 2.2 + Math.random() * 3.4;
    }
    if (blinkPhase >= 0) {
      blinkPhase += dt / 0.13;
      if (blinkPhase >= 1) {
        blinkPhase = -1;
        blinkValue = 0;
      } else {
        blinkValue = Math.sin(blinkPhase * Math.PI);
      }
    }

    resetAllBones(rig);
    acc.clear();

    const walkPhase = Number(ctx.walkPhase) || 0;
    const gait = (walkPhase / TAU) % 1;
    const stride = Math.sin(gait * TAU);
    const strideCos = Math.cos(gait * TAU);
    const idle = 1 - Math.max(walk, sleepLevel, talk * 0.15, act);
    const breathe = Math.sin(time * (sleepLevel > 0.5 ? 1.05 : 1.65));
    const breathAmp = 0.34 * (1 - walk * 0.35);
    const gesture = Math.sin(time * 4.4);
    const talkArm = talk * (1 - walk) * (1 - sleepLevel) * (1 - dragLevel);

    // Torso: breathing, lazy weight shifts, and the walk's counter-rotation.
    // The pelvis and chest twist at their widest when the legs are split
    // (contact), which is the cosine of the gait phase, not the sine.
    // Carried around the waist she folds over the carrier's arms, so the chest
    // and upper spine take the bend while the hips and legs keep hanging.
    add('上半身2', breathe * breathAmp + 2.2 * walk + 3.4 * sleepLevel + 2 * handHeld
      + 22 * waistHeld, 0, 0);
    add('上半身',
      breathe * breathAmp * 0.5 + 2.8 * walk + 3.2 * sleepLevel + 52 * waistHeld,
      -strideCos * 3.2 * walk,
      -stride * 1.2 * walk + Math.sin(time * 0.63) * 0.4 * idle + 3.5 * handHeld * heldLean
    );
    add('腰',
      0,
      strideCos * 4.6 * walk + Math.sin(time * 0.63) * 1.1 * idle,
      stride * 2.2 * walk + Math.sin(time * 1.02) * 0.6 * idle + 2 * handHeld * heldLean
    );

    // Jump body english: fold forward in the crouch, arch a little on launch,
    // and pitch forward again to absorb the landing.
    add('上半身2', 9 * jumpCrouchLevel - 2 * jumpAirLevel + 7 * jumpLandLevel, 0, 0);
    add('上半身', 10 * jumpCrouchLevel + 1.5 * jumpAirLevel + 8 * jumpLandLevel, 0, 0);
    add('腰', 3 * jumpCrouchLevel, 0, 0);

    // Head: stabilized against the body, with walk bob, talk nods and sleep droop
    add('首',
      1.4 * talkArm * Math.sin(time * 2.4) + 5.2 * sleepLevel - 1.2 * dragLevel
        - 1.4 * walk + 2.5 * handHeld + 18 * waistHeld,
      -strideCos * 1.4 * walk + 2.2 * talkArm * Math.sin(time * 1.3),
      2.4 * sleepLevel
    );
    add('頭',
      breathe * 0.24 + Math.sin(gait * TAU * 2) * 0.9 * walk
        + 2.4 * talkArm * Math.sin(time * 6.2) - 2.2 * talkArm
        + 15 * sleepLevel + 3.5 * patLevel - 2.5 * dragLevel - 1.2 * walk + 12 * waistHeld,
      Math.sin(time * 0.37) * 4.2 * idle - strideCos * 1.8 * walk
        + 4.4 * talkArm * Math.sin(time * 1.7) + 5.5 * patLevel,
      Math.sin(time * 0.61) * 1.7 * idle - stride * 1.2 * walk
        + 2.4 * talkArm * Math.sin(time * 2.1) + 7 * patLevel + 3.2 * sleepLevel
    );

    // The head stays level through the crouch and snaps up on the launch.
    add('首', -5 * jumpCrouchLevel - 2 * jumpAirLevel - 4 * jumpLandLevel, 0, 0);
    add('頭', -3 * jumpCrouchLevel - 1 * jumpAirLevel - 2.5 * jumpLandLevel, 0, 0);

    // Being carried too long: twist and shake her head while she complains.
    if (struggle > 0.001) {
      add('腰', 0, Math.sin(time * 7.1) * 4 * struggle, 0);
      add('上半身', 0, Math.sin(time * 6.3) * 3 * struggle, Math.sin(time * 8.2) * 1.6 * struggle);
      add('首', 0, Math.sin(time * 10.3) * 2.5 * struggle, 0);
      add('頭', 0, Math.sin(time * 9.1) * 3.5 * struggle, 0);
    }

    // Legs: the stance leg stays long, the swing leg folds and clears the floor
    if (walk > 0.001) {
      const left = sampleGait(LEG_KEYS, gait);
      const right = sampleGait(LEG_KEYS, gait + 0.5);
      add('左足', left.hip * walk, 0, 0);
      add('右足', right.hip * walk, 0, 0);
      add('左ひざ', left.knee * walk, 0, 0);
      add('右ひざ', right.knee * walk, 0, 0);
      add('左足首', left.ankle * walk, 0, 0);
      add('右足首', right.ankle * walk, 0, 0);
      add('左つま先', left.toe * walk, 0, 0);
      add('右つま先', right.toe * walk, 0, 0);
    }
    if (run > 0.001) {
      const left = sampleGait(RUN_KEYS, gait);
      const right = sampleGait(RUN_KEYS, gait + 0.5);
      add('左足', left.hip * run, 0, 0);
      add('右足', right.hip * run, 0, 0);
      add('左ひざ', left.knee * run, 0, 0);
      add('右ひざ', right.knee * run, 0, 0);
      add('左足首', left.ankle * run, 0, 0);
      add('右足首', right.ankle * run, 0, 0);
      add('左つま先', left.toe * run, 0, 0);
      add('右つま先', right.toe * run, 0, 0);

      add('上半身2', 9 * run, 0, 0);
      add('上半身', 4 * run, -strideCos * 4.5 * run, 0);
      add('腰', 0, strideCos * 6 * run, stride * 3 * run);
      add('首', -2 * run, -strideCos * 2 * run, 0);
      add('頭', -3 * run + Math.sin(gait * TAU * 2) * 1.6 * run, -strideCos * 2.4 * run, 0);

      // Running arms: elbows stay folded near 90 degrees and only the upper arm
      // pumps about 30 degrees, so the hands travel beside the waist instead of
      // punching out in front of the chest.
      const pump = strideCos;
      add('左肩', -1.2 * run, 0, 2.4 * run);
      add('右肩', -1.2 * run, 0, -2.4 * run);
      if (sideArms) {
        add('左腕', 0, pump * 30 * run, -3 * run);
        add('右腕', 0, pump * 30 * run, 3 * run);
      } else {
        add('左腕', pump * 30 * run, 0, 6 * run);
        add('右腕', -pump * 30 * run, 0, -6 * run);
      }
      add('左ひじ', -82 * run - Math.max(0, -pump) * 8 * run, 0, 0);
      add('右ひじ', -82 * run - Math.max(0, pump) * 8 * run, 0, 0);
      add('左手首', Math.max(0, -pump) * 6 * run, 0, 0);
      add('右手首', -Math.max(0, pump) * 6 * run, 0, 0);
    }
    // Soft knees while standing, and a slightly bent, sleepy stance
    add('左ひざ', (2.2 * idle + 4 * sleepLevel) * (1 - walk), 0, 0);
    add('右ひざ', (2.2 * idle + 4 * sleepLevel) * (1 - walk), 0, 0);

    // Jump legs: knees fold under the crouch, then the legs tuck up unevenly in
    // the air (one thigh drives high, the other trails) with the toes pointed,
    // and finally the knees give again to absorb the impact.
    if (jumpCrouchLevel > 0.001 || jumpAirLevel > 0.001 || jumpLandLevel > 0.001) {
      const crouchHip = -30 * jumpCrouchLevel;
      const crouchKnee = 60 * jumpCrouchLevel;
      const crouchAnkle = -24 * jumpCrouchLevel;
      const landHip = -24 * jumpLandLevel;
      const landKnee = 54 * jumpLandLevel;
      const landAnkle = -18 * jumpLandLevel;
      add('左足', crouchHip - 40 * jumpAirLevel + landHip, 0, 0);
      add('右足', crouchHip - 26 * jumpAirLevel + landHip, 0, 0);
      add('左ひざ', crouchKnee + 64 * jumpAirLevel + landKnee, 0, 0);
      add('右ひざ', crouchKnee + 46 * jumpAirLevel + landKnee, 0, 0);
      add('左足首', crouchAnkle + 16 * jumpAirLevel + landAnkle, 0, 0);
      add('右足首', crouchAnkle + 20 * jumpAirLevel + landAnkle, 0, 0);
      add('左つま先', 12 * jumpAirLevel, 0, 0);
      add('右つま先', 10 * jumpAirLevel, 0, 0);
    }

    // Held poses. Hoisted by one hand she drops into Blue Archive's pickup
    // motion: shoulders drawn in, one knee tucked, toes pointed, legs swinging
    // like a pendulum. Held around the waist both legs just hang loose.
    if (heldLevel > 0.001) {
      if (handHeld > 0.001) {
        add('左足', -12 * handHeld + Math.sin(time * 1.35) * 4 * handHeld, 0, 0);
        add('右足', -4 * handHeld + Math.sin(time * 1.35 + 0.5) * 4 * handHeld, 0, 0);
        add('左ひざ', 34 * handHeld, 0, 0);
        add('右ひざ', 14 * handHeld, 0, 0);
        add('左足首', 20 * handHeld, 0, 0);
        add('右足首', 12 * handHeld, 0, 0);
      }
      if (waistHeld > 0.001) {
        const legSway = Math.sin(time * 1.6);
        add('左足', (-5 + legSway * 2.5) * waistHeld, 0, 0);
        add('右足', (-5 - legSway * 2.5) * waistHeld, 0, 0);
        add('左ひざ', 8 * waistHeld, 0, 0);
        add('右ひざ', 10 * waistHeld, 0, 0);
        add('左足首', 18 * waistHeld, 0, 0);
        add('右足首', 18 * waistHeld, 0, 0);
      }
      if (struggle > 0.001) {
        // Fed up with being carried: alternate kicks with the knees snapping
        // straight each time the leg flicks out.
        const kickL = Math.sin(time * 8.6);
        const kickR = Math.sin(time * 8.6 + Math.PI);
        add('左足', kickL * 16 * struggle, 0, 0);
        add('右足', kickR * 16 * struggle, 0, 0);
        add('左ひざ', Math.max(0, kickL) * 26 * struggle, 0, 0);
        add('右ひざ', Math.max(0, kickR) * 26 * struggle, 0, 0);
        add('左足首', -Math.max(0, kickL) * 12 * struggle, 0, 0);
        add('右足首', -Math.max(0, kickR) * 12 * struggle, 0, 0);
      }
    }

    // Arms: the source rig is authored in an A-pose, so every pose first drops
    // the upper arms toward the body. Root-space Z swings the arms in the
    // frontal plane: the sign that lowers one arm raises the other, and the two
    // rigs are mirrored. v5's arms hang along the body, so X swings them
    // backward when positive. DeepSeek's arms point sideways at rest, so the
    // swing has to happen around the vertical axis instead.
    // In the waist carry the chest is folded over, which turns the frontal drop
    // axis nearly vertical too; the waist term therefore swings the upper arms
    // around the body's up axis to keep them dangling straight down.
    const armSwing = strideCos;
    const leftForward = Math.max(0, -armSwing);
    const rightForward = Math.max(0, armSwing);
    // The drop keeps the arms hanging at rest and when carried around the
    // waist; a fall or the one-hand hoist releases it.
    const armDrop = armDropBase * (1 - dragLevel + waistHeld);
    // Falling keeps the old spread-arm flail; once the pet is actually in hand
    // the hoist pose takes over and the flail fades out.
    const flail = dragLevel * (1 - heldLevel);
    const heldSway = Math.sin(time * 1.7) * 2.5 + Math.sin(time * 0.83) * 1.5;
    add('左肩', -1.4 * walk + 2 * handHeld, 0,
      3.4 * walk + 2.4 * patLevel + 3 * handHeld + heldSway * 0.4
        + Math.sin(time * 8.2) * 1.5 * struggle);
    add('右肩', -1.4 * walk + 3 * handHeld, 0,
      -3.4 * walk - 2.4 * patLevel - 2 * handHeld - heldSway * 0.4
        - Math.sin(time * 8.2 + 0.9) * 1.5 * struggle);
    if (sideArms) {
      // Both arms take the same Y sign: the bones point along opposite X axes,
      // so one Y rotation already swings them in opposite directions. When
      // hoisted, the left arm shoots overhead and the right one dangles.
      add('左腕',
        -60 * patLevel - 6 * handHeld + heldSway * 0.4 - 62 * waistHeld
          + Math.sin(time * 1.6) * 2 * waistHeld,
        -5 + armSwing * 30 * walk + Math.sin(time * 1.15) * 1.5 * idle
          - 18 * flail + 25 * patLevel - 45 * waistHeld
          + Math.sin(time * 1.6 + 0.4) * 1.5 * waistHeld
          + Math.sin(time * 8.5) * 10 * struggle * waistHeld
          + 26 * jumpCrouchLevel - 30 * jumpAirLevel - 20 * jumpLandLevel,
        -(armDrop + Math.sin(time * 1.35) * 1.2 * idle - 30 * flail - 118 * patLevel)
          + 110 * handHeld + heldSway + 10 * waistHeld
          + 26 * jumpAirLevel + 10 * jumpLandLevel
      );
      add('右腕',
        -4 * handHeld + heldSway * 0.3 - 62 * waistHeld
          + Math.sin(time * 1.6 + 0.7) * 2 * waistHeld,
        5 + armSwing * 30 * walk + Math.sin(time * 1.05 + 1.2) * 1.5 * idle
          + 18 * flail - 29 * talkArm + 5 * handHeld + 45 * waistHeld
          - Math.sin(time * 1.6 + 0.4) * 1.5 * waistHeld
          + Math.sin(time * 8.5 + 1.2) * 10 * struggle
          - 26 * jumpCrouchLevel + 30 * jumpAirLevel + 20 * jumpLandLevel,
        armDrop + Math.sin(time * 1.25 + 0.8) * 1.2 * idle - 30 * flail
          + 4 * talkArm + gesture * 2 * talkArm + 52 * handHeld + heldSway * 0.6
          - 10 * waistHeld
          - 26 * jumpAirLevel - 10 * jumpLandLevel
      );
      add('左ひじ',
        -16 - leftForward * 16 * walk - 4 * flail - 104 * patLevel - 8 * handHeld + 2 * waistHeld
          - Math.max(0, Math.sin(time * 8.5 + 0.7)) * 10 * struggle * waistHeld
          - 4 * jumpCrouchLevel - 30 * jumpAirLevel - 10 * jumpLandLevel,
        -80 * patLevel, -10 * handHeld);
      add('右ひじ',
        -16 - rightForward * 16 * walk - 4 * flail - 58 * talkArm - gesture * 5 * talkArm
          - 18 * handHeld + 2 * waistHeld
          - Math.max(0, Math.sin(time * 8.5 + 1.2)) * 12 * struggle
          - 4 * jumpCrouchLevel - 30 * jumpAirLevel - 10 * jumpLandLevel,
        0, 0);
      add('左手首', 0, 0,
        Math.sin(time * 1.5) * 1.2 * idle - 8 * patLevel + 5 * handHeld
          + Math.sin(time * 8.9) * 8 * struggle * waistHeld);
      add('右手首',
        -rightForward * 5 * walk - 8 * talkArm + gesture * 3 * talkArm + 6 * handHeld
          + Math.sin(time * 8.9 + 1.2) * 8 * struggle,
        0, 0);
    } else {
      const armFwd = -8 * (1 - dragLevel);
      add('左腕',
        armFwd + armSwing * 26 * walk + Math.sin(time * 1.15) * 1.5 * idle - 18 * flail
          - 24 * patLevel - 4 * handHeld + heldSway * 0.4 - 62 * waistHeld
          + Math.sin(time * 1.6) * 2 * waistHeld
          + Math.sin(time * 8.5) * 8 * struggle * waistHeld
          + 26 * jumpCrouchLevel - 30 * jumpAirLevel - 20 * jumpLandLevel,
        -3 * patLevel + 42 * waistHeld
          + Math.sin(time * 1.6 + 0.4) * 1.5 * waistHeld,
        armDrop + Math.sin(time * 1.35) * 1.2 * idle - 30 * flail - 26 * patLevel
          - 112 * handHeld - heldSway + 20 * waistHeld
          - 26 * jumpAirLevel - 10 * jumpLandLevel
      );
      add('右腕',
        armFwd - armSwing * 26 * walk + Math.sin(time * 1.05 + 1.2) * 1.5 * idle - 18 * flail
          - 29 * talkArm - 4 * handHeld + heldSway * 0.3 - 62 * waistHeld
          + Math.sin(time * 1.6 + 0.7) * 2 * waistHeld
          + Math.sin(time * 8.5 + 1.2) * 8 * struggle
          - 26 * jumpCrouchLevel + 30 * jumpAirLevel + 20 * jumpLandLevel,
        -4 * talkArm - 42 * waistHeld
          - Math.sin(time * 1.6 + 0.4) * 1.5 * waistHeld,
        -armDrop - Math.sin(time * 1.25 + 0.8) * 1.2 * idle + 30 * flail
          + 4 * talkArm + gesture * 2 * talkArm - 40 * handHeld + heldSway * 0.6
          - 20 * waistHeld
          + 26 * jumpAirLevel + 10 * jumpLandLevel
      );
      add('左ひじ',
        -16 - leftForward * 14 * walk - 4 * flail - 46 * patLevel - 8 * handHeld - 6 * waistHeld
          - Math.max(0, Math.sin(time * 8.5 + 0.7)) * 10 * struggle * waistHeld
          - 4 * jumpCrouchLevel - 30 * jumpAirLevel - 10 * jumpLandLevel,
        0, 10 * handHeld);
      add('右ひじ',
        -16 - rightForward * 14 * walk - 4 * flail - 58 * talkArm - gesture * 5 * talkArm
          - 18 * handHeld - 6 * waistHeld
          - Math.max(0, Math.sin(time * 8.5 + 1.2)) * 12 * struggle
          - 4 * jumpCrouchLevel - 30 * jumpAirLevel - 10 * jumpLandLevel,
        0, 0);
      add('左手首', leftForward * 4 * walk, 0,
        Math.sin(time * 1.5) * 1.2 * idle - 8 * patLevel + 5 * handHeld
          + Math.sin(time * 9.1) * 7 * struggle * waistHeld);
      add('右手首',
        -rightForward * 5 * walk - 8 * talkArm + gesture * 3 * talkArm + 6 * handHeld
          + Math.sin(time * 9.1 + 1.2) * 7 * struggle,
        0, 0);
    }

    // Skirt and hair: overlap driven by the step, breathing and head turns
    const hairDrive = Math.max(walk, run * 1.3);
    for (let i = 0; i < skirtRoots.length; i += 1) {
      const phase = gait * TAU + i * 0.5;
      add(skirtRoots[i],
        Math.sin(phase) * 2.6 * hairDrive + Math.sin(time * 1.15 + i) * 0.45 * idle
          + Math.sin(time * 9 + i) * 2.5 * jumpAirLevel,
        0,
        Math.cos(phase) * 1.6 * hairDrive + Math.sin(time * 0.9 + i * 0.6) * 0.4 * idle
          + Math.cos(time * 8 + i) * 1.5 * jumpAirLevel
      );
    }
    for (let i = 0; i < hairRoots.length; i += 1) {
      const phase = time * 1.05 + i * 0.52;
      add(hairRoots[i],
        Math.sin(phase) * (0.7 + 0.8 * hairDrive) + Math.sin(gait * TAU * 2 + i) * 1.1 * hairDrive
          + Math.sin(time * 10 + i * 0.8) * 2.5 * jumpAirLevel,
        0,
        Math.cos(phase * 0.82) * (0.5 + 0.6 * hairDrive) + Math.cos(gait * TAU + i * 0.6) * 0.8 * hairDrive
          + Math.cos(time * 9.4 + i * 0.7) * 1.5 * jumpAirLevel
      );
    }
    // The tail lags behind the body with a slow wag, and whips up on a jump.
    for (let i = 0; i < tailRoots.length; i += 1) {
      const phase = time * 1.25 + i * 0.6;
      add(tailRoots[i],
        Math.sin(phase) * 1.2 + Math.sin(gait * TAU + i) * 2.4 * hairDrive
          + Math.sin(time * 9 + i) * 4 * jumpAirLevel,
        Math.sin(phase * 0.7) * (1.6 + 1.4 * hairDrive),
        Math.cos(phase) * 0.9 + Math.cos(gait * TAU + i * 0.4) * 1.2 * hairDrive
      );
    }

    // Blend a complete seated skeleton over the base pose, never scale a
    // standing model into a sitting silhouette. The pelvis stays on the edge.
    if (sitLevel > 0.001) {
      const curl = ctx.sitStyle === 'curl';
      const pose = (name, x, y = 0, z = 0) => {
        if (!rig.bones.has(name)) return;
        const old = acc.get(name) || { x: 0, y: 0, z: 0 };
        acc.set(name, { x: old.x + (x - old.x) * sitLevel,
          y: old.y + (y - old.y) * sitLevel, z: old.z + (z - old.z) * sitLevel });
      };
      const swing = Math.sin(time * 2.5);
      pose('腰', 0);
      pose('上半身', curl ? 19 : -3);
      pose('上半身2', (curl ? 14 : 2) + breathe * 0.35);
      pose('首', curl ? 7 : -1);
      pose('頭', curl ? 10 : 0, Math.sin(time * 0.45) * 3, curl ? 3 : 0);
      for (const [side, sign] of [['左', 1], ['右', -1]]) {
        // Front: horizontal thighs and alternating pendulum-like shins.
        // Curl: knees against the chest, feet tucked close to the seat.
        pose(side + '足', curl ? -118 : -88, 0, sign * (curl ? 2 : 4));
        pose(side + 'ひざ', curl ? 142 : 88 + sign * swing * 15);
        pose(side + '足首', curl ? 14 : 10 + sign * swing * 5);
        pose(side + 'つま先', curl ? 0 : 6);
        pose(side + '肩', curl ? 5 : 0, 0, sign * 2);
        if (sideArms) {
          pose(side + '腕', curl ? -32 : 5, sign * (curl ? -53 : -8),
            -sign * (curl ? 28 : armDropBase));
        } else {
          pose(side + '腕', curl ? -58 : 8, sign * (curl ? 18 : 0),
            sign * (curl ? 24 : armDropBase));
        }
        pose(side + 'ひじ', curl ? -112 : -22, 0, sign * (curl ? -10 : 0));
        pose(side + '手首', curl ? -10 : 0, 0, sign * (curl ? -8 : 0));
      }
      if (curl) {
        // Per-rig reach calibrated against the knee joints: both hands wrap
        // around the raised knees, rather than hovering beside the torso.
        const reach = deepseek ? [-22, -84, 65, -140] : [-40, 72, 59, -128];
        for (const [side, sign] of [['左', 1], ['右', -1]]) {
          pose(side + '腕', reach[0], sign * reach[1], sign * reach[2]);
          pose(side + 'ひじ', reach[3]);
        }
      }
      // Lift the front fabric with the thighs rather than leaving the skirt
      // pointing straight down through both knees.
      for (const name of skirtRoots) {
        const bone = rig.bones.get(name)[0];
        const v = bone.getWorldPosition(bone.position.clone());
        rig.root.worldToLocal(v);
        if (v.z > 0) pose(name, curl ? -68 : -58);
      }
    }

    for (const [name, rotation] of acc) {
      const list = rig.bones.get(name);
      if (!list) continue;
      for (const bone of list) applyBoneRotation(bone, rotation.x, rotation.y, rotation.z);
    }

    // The waist carry rolls the hands dorsal-side forward; flip both forearms so
    // the palms face front and the thumbs hang naturally.
    if (waistHeld > 0.001) {
      for (const name of ['左手捩', '右手捩']) {
        for (const bone of rig.bones.get(name) || []) applyBoneTwist(bone, 180 * waistHeld);
      }
    }

    // Face: blinking, speech syllables, sleepy eyes, and a few reactions
    const syllable = Math.max(0, Math.sin(time * 10.8 + Math.sin(time * 4.1) * 2.2));
    const mouth = talk * (1 - sleepLevel) * (0.1 + 0.58 * Math.pow(syllable, 1.5));
    resetMorphs(rig);
    setMorph(rig, 'まばたき', Math.max(sleepLevel * 0.98, blinkValue));
    setMorph(rig, 'あ', mouth);
    setMorph(rig, 'い', talk * (1 - sleepLevel) * 0.1 * (0.5 + 0.5 * Math.sin(time * 7.3 + 1.1)));
    setMorph(rig, '笑い', 0.78 * patLevel);
    setMorph(rig, '口角上げ', 0.14 * patLevel + 0.07 * talkArm);
    setMorph(rig, '困る', Math.max(0.3 * dragLevel, 0.42 * heldLevel) * (1 - 0.55 * struggle));
    setMorph(rig, '怒り', 0.55 * struggle);
    setMorph(rig, '口角下げ', 0.3 * struggle);
    setMorph(rig, '上', 0.12 * talkArm * (0.5 + 0.5 * Math.sin(time * 1.4)));

    // Keep the soles on the floor while the knees fold in the crouch and on
    // landing: measure how far the pose lifts the feet and sink the root by it.
    let footLift = 0;
    const groundJump = Math.max(jumpCrouchLevel, jumpLandLevel) * (1 - Math.min(1, walk));
    if (groundJump > 0.01 && footBones.length && Number.isFinite(restFootY)) {
      rig.root.updateMatrixWorld(true);
      let minY = Infinity;
      for (const bone of footBones) {
        const v = bone.getWorldPosition(bone.position.clone());
        rig.root.worldToLocal(v);
        if (v.y < minY) minY = v.y;
      }
      footLift = Math.max(0, minY - restFootY) * rig.root.scale.y * groundJump;
    }

    // Root motion, as fractions of body height. The caller applies the drop and
    // bob so feet stay planted; the rig itself only carries the pose.
    let rootBob = -footLift;
    if (walk > 0.001) {
      if (sideArms) {
        // Same down-after-contact timing as v5; a deeper, symmetric sink pushed
        // the trailing toe through the floor during push-off.
        rootBob -= 0.012 * Math.max(0, Math.cos((walkPhase - 0.08 * TAU) * 2)) ** 2 * walk;
      } else {
        // Lowest just after each contact ("down"), highest while the body passes
        // over the planted foot.
        rootBob -= 0.014 * Math.max(0, Math.cos((walkPhase - 0.08 * TAU) * 2)) ** 2 * walk;
      }
    }
    if (run > 0.001) {
      // Lowest at mid-stance (p ~ 0.22 / 0.72), highest during the flight phase.
      const stanceWave = Math.cos((walkPhase - 0.22 * TAU) * 2);
      rootBob += 0.018 * Math.max(0, -stanceWave) ** 2 * run;
    }

    // The held body bobs gently from the grip point, as in Blue Archive's
    // pickup motion, and shakes harder once she starts struggling.
    rootBob += Math.sin(time * 2.6) * 0.008 * heldLevel
      + Math.sin(time * 8.6) * 0.005 * struggle;

    return { bob: rootBob, drop: 0 };
  }

  function reset() {
    resetAllBones(rig);
    resetMorphs(rig);
    walk = 0;
    talk = 0;
    sleepLevel = 0;
    dragLevel = 0;
    heldLevel = 0;
    heldTime = 0;
    jumpCrouchLevel = 0;
    jumpAirLevel = 0;
    jumpLandLevel = 0;
    patLevel = 0;
    sitLevel = 0;
    motion = null;
    motionBlend = 0;
    blinkValue = 0;
    blinkPhase = -1;
    blinkTimer = 2 + Math.random() * 3;
    acc.clear();
  }

  return { update, reset, rig };
}
