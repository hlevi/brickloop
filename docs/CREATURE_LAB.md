# Creature Lab: product spec

Produced by a judge-panel design process (4 proposals, 4 judges) and adopted for implementation. Foundation already implemented: see 'Foundation (done)' below.

## Vision

Kids don't want to recolor a puppy an adult designed. They want to invent something nobody else has, watch it come alive, and then hold the real thing. Creature Lab makes BrickLoop the place where that happens.

In about two minutes a 5-10 year old snaps together a creature (body, legs or wheels, head, googly eyes, tail, back, horns), paints it with a one-tap world palette, and gives it a glowing see-through power core and a silly name from word reels. Then they press "Bring it to life!" and watch it build itself brick by brick, in the same order they will build it at home. It blinks, bobs and glows. Its trading card flips over with stats calculated from the bricks they chose: wings make it Fly, wheels make it Zoom. So they go back and keep tinkering.

When they love it, they tap "Show a grown-up". A grown-up opens the wish on their own phone, sees one fixed price, and orders those exact genuine bricks. They arrive with a booklet whose cover shows the creature's name and "Invented by BraveOtter42". The last step reads: "Make a wish, then click Captain Fizzfang's power core into place."

Three promises a kid can feel:
- **It's MINE.** Shape, face, colors, power and name are all the kid's choices, and the kid is credited everywhere.
- **It's ALIVE.** It reacts to every tap and assembles itself.
- **It's REAL.** Every brick on screen is a brick in the box.

None of the engine is new. The creature is one new kit whose options are module slots. It is compiled by the existing kit compiler and checked by the existing validator. Every one of its 4,860 combinations has been verified buildable: I ran all of them through compileBlueprint and validateModel, with 0 errors and 0 overhang warnings, at about 55 ms each. A kid can never make something we can't send.

The kid side asks for nothing personal and never shows money. Buying stays with adults, through the existing order workflow, which is clearly labeled as a simulation.

## The kid moment

A 7-year-old opens the Lab and a random creature is already there, bobbing and blinking. She pulls the Shuffle lever twice and laughs at a robot head on wheels. She locks the head with its padlock, then taps the Googly eyes tile: two big white eyes with black pupils pop onto its head with a "pop" sound, and they blink. She taps "Lava", and it turns orange and black. In the Power tab she picks Zap, and a yellow see-through core lights up on its back. She spins the name reels to "Captain Fizzfang" and taps her builder tag, BraveOtter42.

Then she presses the big "Bring it to life!" button. The screen dims, the creature disappears, and it builds itself back brick by brick:
1. Wheels.
2. Chassis.
3. Body.
4. Head.
5. Face.
6. Eyes.
7. Last, the yellow power core drops in with a clunk and starts to pulse.

Its eyes blink open, it does a little hop, and its card flips over: "CAPTAIN FIZZFANG · Invented by BraveOtter42 · Size 3 · Zoom 5 · Fly 3 · Armor 1 · Chomp 3 · Super Zoomer". Underneath it says: "These 39 real bricks can come to your house."

She immediately goes back, swaps the jetpack for wings, and watches Fly jump to 5. Then she taps "Show a grown-up" and carries the tablet to her dad.

## Core loop

- 1. Home (/): the hero is a live creature bobbing on a colored backdrop with the line "Invent a creature. We mail you the real bricks." It has one big "Start inventing" button and a small "Grown-ups: have a wish code?" link to /w. The six ready-made kits move below, under "Ready-made kits".
- 2. The Lab (/lab/[id]) opens on a random starter creature that is already alive (one shuffle runs on creation), so there is never a blank canvas.
- 3. Shape it: a bottom tab bar with picture icons (Body, Legs, Head, Eyes, Tail, Back, Top). Each tab shows 3-5 big tiles, each one a render of THIS creature with that part. Tapping one drops the new bricks in with a pop, wiggles the card's stat pips and ticks the brick counter ("41 bricks").
- 4. Shuffle lever: spins every unlocked slot. A padlock on each tab keeps the parts the kid loves, and one Undo reverts the whole shuffle.
- 5. Colors: one-tap world palettes (Lava, Frost, Jungle, Deep Sea, Candy, Robot) or per-zone swatches (skin, belly, feet, eyes, spikes).
- 6. Power: Fire, Zap, Leaf, Ice or Star sets the color and glow of the see-through power-core brick.
- 7. Name: three spinnable word reels (Title | Word | Ending, e.g. Captain | Fizz | fang) and a choice of three generated builder tags (e.g. BraveOtter42). There is no keyboard anywhere.
- 8. "Bring it to life!": the creature rebuilds itself in true build order, the core lands last and glows, its eyes blink open, and the card flips. Kids replay this freely.
- 9. "Show a grown-up": a full-screen wish card with the creature, its name, a big 8-character code, a QR code and one note sticker ("I invented this!" / "Can we build it together?" / "For a special day?"). It shows one calm status line: Waiting for a grown-up.
- 10. The grown-up scans or types the code on their own phone (/w/CODE). They pass a neutral age screen and see the creature page with one fixed price, then order through the existing adult checkout (simulated and labeled).
- 11. The kid's wish card status only ever moves forward: A grown-up is looking, Ordered!, Gathering your bricks, Packing, On its way, It's here! Problems only show as "Taking a little longer".
- 12. The parcel of genuine parts arrives. The grown-up prints or opens the personalized Creature Pack PDF. The kid cuts out the card, builds 7-8 steps named after body parts, and saves the power core for the last step: "Make a wish, then click Captain Fizzfang's power core into place."
- 13. Back in the Lab: "Invent another". Designs stay on the device under the existing anonymous cookie.

## Foundation (done)

- `src/lib/model/templates/creature.ts`: the `creature` KitDef (lab: true), 7 option slots, 6 color components (skin, belly, feet, eyes, spikes, core). `POWER_UP_STEP`, `{name}` note placeholder resolved in `buildModel`.
- `src/lib/model/templates/index.ts`: `KITS` includes the creature; `READY_MADE_KITS` / `TEMPLATES` exclude lab kits; `isLabKit(template)`; `buildModel` copies `params.identity` (not part of structuralKey).
- `src/lib/model/types.ts`: `CreatureIdentity` and `DesignParams.identity`.
- `src/lib/creature/words.ts`: TITLES/WORDS/ENDINGS/ADJECTIVES/ANIMALS, `renderName`, `renderBuilder`, `isValidIdentity`, `identityFromSeed`, `POWERS`, `powerOf(coreColor)`.
- `src/lib/creature/stats.ts`: `creatureStats(model)`, `STAT_LABELS`.
- `src/lib/creature/worlds.ts`: 6 `WORLDS` palettes + `backdropFor(colors)`.
- `src/lib/creature/anim.ts`: `partKey(part)`, `revealOrder(parts)`.
- `src/lib/edit/tools.ts`: `set_identity` tool (lab only, indices only; not offered to the LLM).
- `src/lib/designs.ts`: DesignView has `lab` and `stats`; lab designs: name follows identity, chat/chatHistory/rename/uploads return 404, budget suggestions empty.
- `src/components/lab/CreatureCard.tsx` (+ css): the trading card. `src/components/lab/WishCard.tsx`: stub with the fixed props contract.
- Round 2x2 parts render correctly (iso + 3D). New colors: trans-red, trans-yellow, trans-green.
- `tests/creature.test.ts`: covering set + seeded sample + `CREATURE_EXHAUSTIVE=1` exhaustive run, stats, blocklist, worlds, anim.

## MVP features

### Creature kit v1: snap-together modules with a face (M (~2.5h; spike and fixes already proven))

A seventh KitDef, 'creature', marked lab: true. Its options are 7 structural slots:
- Body: Chunky, Long, Tall
- Legs: Stompers, Paws, Wheels
- Head: Chomper, Bug, Beak, Robo
- Eyes: Googly, Big Eye, Little
- Tail: None, Stub, Whip
- Back: None, Spikes, Wings, Shell, Jetpack
- Top: None, Horns, Crest

That is 24 modules and 4,860 structural combinations. It has 6 color zones: skin, belly, feet, eyes, spikes and core.

The 'Face Kit' is what turns a boxy block into a character. Googly eyes are white 2x2 round bricks with black 1x1 round-plate pupils sitting on top of the head. Big Eye is a single centered eye. Little is the existing small side eyes.

Every creature reserves an open socket on its back for the power core. The core is placed alone in a final 'Power up!' step.

I prototyped this against the real compiler and validator. All 4,860 combinations returned 'valid' with 0 errors and 0 long_overhang warnings, at 55.5 ms each, with 29-61 pieces, $11.91-$15.35 cost-plus estimate and 7-8 steps. The only warnings were single-stud ones on pupils, horns and eyes, which is normal brick practice.

**Acceptance criteria**

- For all 4,860 option combinations, buildModel({template:'creature', options}) passes validateModel with status 'valid', 0 errors and 0 long_overhang warnings. This is checked by an exhaustive CI job (CREATURE_EXHAUSTIVE=1, about 5 min).
- The per-PR test runs a covering set (every module value on every body, plus every head x eyes x top combination) and a seeded random sample of 200. It adds under 30 s to npm test.
- In every model the last step is titled 'Power up!' and contains exactly one part: a brick-round-1x1 with component 'core', connected through studs to a part placed in an earlier step.
- Step titles come only from: Wheels/Feet, Chassis/Legs, Body, Head and back, Face, Top of the head, Eyes and horns, Power up!. There are 7-8 steps.
- A colors-only change never changes structuralKey, and buildModel is deterministic.
- The home gallery still lists exactly the six ready-made kits. GET /api/designs/[id]/budget for a creature returns in under 200 ms with an empty suggestions list. tests/model.test.ts allConfigs() skips lab kits, so its runtime is unchanged.
- A brick-round-2x2 renders as a 2-stud-wide cylinder with 4 studs, both in the iso SVG and in the 3D viewer. Today both draw it as a 1x1 post in the corner, which affects googly eyes, the jetpack and Turbo Racer's helmet.

**Implementation plan**

The working prototype is at /tmp/claude-0/-home-user-brickloop/cd383271-2266-565a-8031-b03613e22914/scratchpad/v3/creature3b.ts. verify3b.ts in the same folder runs every combination.

1. Productionize the prototype as src/lib/model/templates/creature/{modules.ts, compose.ts, index.ts}.
   - Each module is a draw(put, frame) function. It writes legend chars into named voxel layers: L0-L2 (legs, brick); B0-B2 (body, brick); T0 brick (head and back); T1 brick (face); T2 plate (top of the head); T3 brick (eyes and horns); T4 plate (pupils).
   - The frame is 26 x 12 and faces +x. The body sits at z 3..8.
   - put() throws on overlap or out-of-bounds, so a clashing module fails CI and never reaches a kid.
   - Each head returns top anchors { eyes2, eye1, horns, crest } that are laid out so they never overlap. Chomper eyes sit at (x1+1, z4/z6); the Robo head is 6 long with T2 over its back 4 columns.
   - Eyes: 'o' = {component:'eyes', parts:['brick-round-2x2']}. Pupils: 'p' = {color:'black', group:'pupils', parts:['plate-round-1x1']}, placed on the front-inner stud. 'little' draws the old 'e' cells in T1.
   - The core cell at (headX0-1, z5) is reserved in T0 before back modules draw, and released afterwards. The core is an ExtraPart brick-round-1x1 with component 'core' and extraStep 'Power up!'.
   - Wheels reuse the racer pattern: baseY 2, plate-2x2-wheel-holder and wheel-8x6 extras with attachTo.
   - Overhang fix from the exhaustive run: on the Long body (12 studs), Stompers become two leg pairs at x0+2 and x1-2, and Paws become 3 studs wide. This removed all 1,440 long_overhang warnings.
2. Type and registry changes.
   - Add `lab?: boolean` to KitDef in templates/types.ts. The creature uses ageBand '6+', so the age-band test is unchanged.
   - Register CREATURE in KITS so getKit, applyTool, buildModel, revisions, BOM, PDF and orders work unchanged.
   - Filter `!k.lab` in src/app/page.tsx.
   - Early-return an empty suggestions list in budgetSuggestions() in src/lib/designs.ts for lab kits. Its cartesian product would otherwise compile 4,860 models, about 4.5 minutes per request.
   - Skip lab kits in allConfigs() in tests/model.test.ts.
3. Round-part render fix (scratch copy at .../v3/iso2.ts).
   - In iso.ts drawCylinder: center at (x+W/2, z+D/2), r = W/2-0.05, and draw a stud on every cell.
   - In BrickViewer localGeometry: give 'round' a CylinderGeometry of radius w/2-0.05 translated to (w/2, H/2, d/2), plus studs on all cells.
4. Tests: new tests/creature.test.ts covering the covering set, the seeded sample and the env-gated exhaustive run, using the assertions listed. Add a separate CI job for the exhaustive run.
5. Version policy: any module change bumps KitDef.version, so frozen orders keep their structuralKey.

### Bring-it-to-life 3D creature (M (~1.5h))

The existing 3D viewer gains an 'alive' mode:
- When a slot changes, only the new bricks drop in with a bounce.
- The creature bobs gently.
- Every 3-5 s its eyes and pupils blink.
- The power core pulses with light in its power color.
- "Bring it to life!" plays an assembly reveal: all parts vanish, then return one by one in true build order (by step, then height), with the core last, a scale pulse and a CSS confetti burst before the card flips.
- A tiny synthesized sound kit (pop, clunk, ta-da) has a mute button. It needs no audio files and no new dependency.

The reveal is an honest preview of the real booklet, because it uses the real parts and steps. 'cad' mode, used by the editor, step viewer and grown-up page, looks exactly as it does today.

**Acceptance criteria**

- Meshes are keyed by a pure helper partKey(p) = `${partId}|${x}|${y}|${z}|${rot}` instead of p.uid, which is renumbered on every compile. A unit test shows that two models differing only in the head share at least 70% of their part keys, and that a colors-only change shares 100%.
- A pure helper revealOrder(parts) returns parts sorted by (step, y, x, z) with the core last. A unit test asserts the step sequence is nondecreasing and the final element has component 'core'.
- In 'alive' mode parts with component 'eyes' or 'pupils' blink, and parts with component 'core' have an animated emissive glow. In 'cad' mode there is no animation and the output matches today's viewer.
- With prefers-reduced-motion: reduce, nothing moves except the blink, and the reveal shows the finished creature immediately.
- A mute toggle silences all sound, and its state persists in localStorage. Every read and write is wrapped in try/catch, and the page works without storage.
- On a 4x CPU-throttled Chrome profile, a slot change on a 61-piece creature paints the new model within 300 ms.

**Implementation plan**

Changes in src/components/BrickViewer.tsx:
- Add props mode: 'cad' | 'alive' (default 'cad'), assembleKey?: number and onAssembled?: () => void.
- Export partKey() and revealOrder() from a small pure module, src/lib/creature/anim.ts, so they are unit-testable.
- Keep a ref with the previous key set. Parts whose key is new start at y+3 units and ease-out-back to rest over 250 ms. Implement this in a per-Part useFrame that reads a start time.
- Idle: one useFrame on the root group sets position.y = 0.06*sin(2t).
- Blink: put eye and pupil meshes in a sub-group whose origin is the lowest eye y. Set its scale.y to 0.15 for 120 ms on a random 3-5 s timer.
- Core: set meshStandardMaterial emissive to the core hex with emissiveIntensity 0.5+0.4*sin(3t), and add a pointLight (intensity 0.6, distance 4) at the core position.
- Assembly: when assembleKey changes, compute revealOrder(parts) and give part i a visibility delay of i*min(40 ms, 2500/n). The core gets a 1.0→1.3→1.0 scale pulse. Call onAssembled after the last part lands.
- Read matchMedia('(prefers-reduced-motion: reduce)') once to disable the tweens.

Add src/lib/creature/sound.ts, a WebAudio oscillator synth of about 30 lines: pop (short sine blip), clunk (low square), ta-da (two-note arpeggio). It creates its AudioContext lazily on the first user tap.

The Editor, StepViewer and grown-up page keep mode 'cad'.

### Creature Lab screen (kid mode) (M (~2h))

/lab/[id] is a tablet-first toy screen:
- A full-width 3D stage on a gradient backdrop in the current world colors.
- The Creature Card beside the stage in landscape, or below it in portrait.
- A bottom tab bar with picture icons: Body, Legs, Head, Eyes, Tail, Back, Top, Colors, Power, Name.
- Above the tab bar, a row of 3-5 large tiles (at least 72 px). Each tile is a render of the current creature with that choice, so kids see exactly what they'll get.
- Floating controls: the Shuffle lever (a padlock appears on each structural tab and on Colors), Undo, a big "Bring it to life!" button, and "Show a grown-up".
- A brick counter ("41 bricks").

The Lab never renders prices, validation messages, text inputs, chat, photo upload, rename, parts tables, CSV/BrickLink XML or revision numbers. Kids get no error states, because every reachable choice is buildable by construction.

**Acceptance criteria**

- Tapping "Start inventing" on / creates a creature design and lands on /lab/[id] showing an animated random creature in under 3 s on a dev machine. Exactly two revisions exist: the template default and the starter shuffle.
- Every tile tap updates the 3D creature from a client-side compile before the server responds, and writes exactly one revision. One Undo restores the previous creature.
- Shuffle changes every unlocked slot to a different value, never touches locked slots, sends one POST /api/designs/[id]/edit, and is fully reverted by one Undo.
- A render test of CreatureLab (or a Playwright smoke check) finds no '$' or currency string, no <input type=text>/<textarea>, no chat or upload controls, and no validation warning text.
- POST /api/designs/[id]/chat, POST /api/designs/[id]/uploads and PATCH /api/designs/[id] return 404 for any design whose kit has lab: true. /design/[id] redirects to /lab/[id] for those designs.
- The layout works at 360 px wide (portrait phone) and at 1024x768 (tablet landscape) with no horizontal scroll, and every tap target is at least 48 px.
- Every World palette uses only colors allowed for each zone. A unit test applies each palette with applyTool and checks that every call returns ok.

**Implementation plan**

1. Pages and components.
   - src/app/lab/[id]/page.tsx is a server component. It checks ownership with getCustomerId and confirms getKit(template).lab, then renders <CreatureLab designId/>.
   - src/components/lab/CreatureLab.tsx loads GET /api/designs/[id].
   - On a tap: compute next = applyTool(params, call) locally (applyTool and buildModel are pure TS and already used client-side by Editor.tsx). Render buildModel(next) immediately, then POST /api/designs/[id]/edit {calls} on a serialized promise chain. On error, reload from the server.
   - Undo uses the existing /api/designs/[id]/undo.
2. Shuffle.
   - For each unlocked slot, pick a random value different from the current one with Math.random. If Colors is unlocked, also pick a random world palette. Send one batch of set_option and set_color calls; applyEdits already writes one revision per batch.
   - Locks are client state only.
3. Tiles.
   - Render toSvg(renderIso(buildModel(withOption).parts), {width:140}) for the open tab only, lazily via requestIdleCallback (3-5 compiles at about 55 ms each).
   - Memoize by structuralKey + colors.
4. Worlds: src/lib/creature/worlds.ts holds 6 palettes, each mapping skin, belly, feet, eyes and spikes to allowed colors, plus a backdrop gradient. Applying one sends one batch of set_color calls.
5. Entry point.
   - StartButton gets an href/route prop. The home hero posts {template:'creature'} and then pushes `/lab/${id}?new=1`.
   - On new=1 the Lab runs one shuffle, including identity (see the Name feature), and then calls router.replace to drop the query.
6. Kid-mode guards.
   - Add isLabKit(template) to templates/index.ts.
   - Check it in the chat, uploads and rename routes (throw AppError not_found) and in src/app/design/[id]/page.tsx (redirect).
7. Layout: CSS grid with the stage at about 60vh. The tab bar is fixed at the bottom on phones.

### Name reels, builder tag and power core (S (~45m))

Name tab: three spinnable reels make a name such as "Captain | Fizz | fang" → "Captain Fizzfang". There are 24 titles, 40 words and 24 endings, which gives 23,040 names. A dice re-rolls all three. The kid picks a builder tag from three generated options (40 adjectives x 40 animals x 2-digit numbers, e.g. BraveOtter42), with a "more" button.

Power tab: five powers, each tied to the see-through core brick's color:
- Fire = trans-red
- Zap = trans-yellow
- Leaf = trans-green
- Ice = trans-light-blue
- Star = trans-clear

Power is derived from the core color, so there is one source of truth. The name becomes the design's name everywhere (Lab, wish card, grown-up page, orders list, PDF). No free text is ever accepted.

**Acceptance criteria**

- set_identity accepts only integer indices within each list's bounds. Strings, floats, negative or out-of-range values are rejected, and the tool is not listed in toolDefinitions(), so the LLM never sees it.
- After a set_identity edit, designs.name equals renderName(identity). Orders list, grown-up page and PDF all show it.
- Name and power changes never change structuralKey (unit test).
- Each of the 5 powers changes only the core's color. The BOM shows one brick-round-1x1 in that trans color, and the core renders in that color in 3D and in the iso view.
- A blocklist test renders all 23,040 names and all builder tags (lowercased, with and without spaces) and finds none that contains a blocklisted substring or matches the curated real-first-name list.
- model.params.identity survives into orders.frozen_model, so the PDF route can read it.

**Implementation plan**

1. Word lists: src/lib/creature/words.ts exports TITLES, WORDS, ENDINGS, ADJECTIVES, ANIMALS, POWERS ({id, label, colorId, icon}), renderName(identity), renderBuilder(identity) and powerOf(coreColor). Lists are curated: original words only, no human first names, no trademark-like endings.
2. Types: add `identity?: { name: [number, number, number]; builder: [number, number, number] }` to DesignParams in src/lib/model/types.ts.
3. buildModel (templates/index.ts) copies params.identity into model.params. It is not part of optKey, so it stays out of structuralKey.
4. Tool: in src/lib/edit/tools.ts add a 'set_identity' branch to applyTool, allowed only when getKit(template).lab. It validates Number.isInteger and the bounds.
5. designs.ts applyEdits: if the kit is lab and identity changed, run UPDATE designs SET name = renderName(...) in the same transaction.
6. Colors: add trans-red (BrickLink 17), trans-yellow (19) and trans-green (20) to src/lib/catalog/colors.ts with transparent: true. They are provisional and unverified like the others. simulatedUnitCents already adds 3c for transparent colors. The creature's core component allows only the 5 trans colors.
7. The starter shuffle also randomizes identity.
8. Test: tests/creature.test.ts loops over all name and builder combinations against a blocklist in tests/fixtures/blocklist.txt.

### Creature Card with stats calculated from the real bricks (S (~30m))

A trading card shown beside the creature. It has the name, "Invented by <tag>", the power icon, five stats shown as 1-5 pips (Size, Zoom, Fly, Armor, Chomp) and a "Super ___" title taken from the top stat (Super Giant, Super Zoomer, Super Flyer, Super Tank, Super Chomper). Pips animate with a floating +1 or -1 when a part changes.

There is no overall score and no ranking against other kids. Stats are a pure function of the compiled parts, so the screen, the grown-up page and the printed card always agree, and design choices visibly matter.

Prototype values:
- Chunky / stompers / chomper / spikes: Size 4, Zoom 1, Fly 1, Armor 3, Chomp 4.
- Long / wheels / robo / jetpack: Zoom 5, Fly 3.
- Tall / paws / beak / wings: Fly 5.

**Acceptance criteria**

- creatureStats(model) is deterministic and reads only model.parts and model.steps.
- For all 4,860 combinations every stat is an integer from 1 to 5 (checked in the exhaustive job).
- Monotonic tests: Wheels always give Zoom 5. Wings always give Fly 5. Switching Back from None to Shell raises Armor to at least 3. Chomper head gives Chomp ≥ 4 and Bug head gives Chomp ≤ 2. Adding wings never lowers any other stat.
- The Super title is stable for ties: fixed priority Zoom > Fly > Chomp > Armor > Size.
- The card renders legibly at 360 px wide, and the same component is used on the grown-up page.

**Implementation plan**

1. src/lib/creature/stats.ts, creatureStats(model), with clamp = round to 1..5:
   - Size = clamp(1 + (heightPlates - 14) / 4).
   - Zoom = 5 if any wheel-8x6. Otherwise 1, plus 2 if a jetpack is present (a brick-round-2x2 whose component is not 'eyes'), plus 1 if the legs are 2 bricks tall or less.
   - Fly = 5 if the z-span is over 8 studs (wings), 3 if a jetpack is present, else 1.
   - Armor = clamp(1 + stud area of slope/ridge parts in the 'spikes' component / 4).
   - Chomp = clamp(1 + studs the head reaches past the front of the parts in the step titled 'Body').
   A prototype is at .../scratchpad/v3/stats3b.ts.
2. Expose stats on DesignView in getDesignView (src/lib/designs.ts). The Lab also computes them client-side from its local model.
3. src/components/lab/CreatureCard.tsx is an HTML/SVG card that reuses toSvg(renderIso(parts)) for the art. Its 63:88 aspect ratio matches the printed card.

### Show a grown-up: wish code, grown-up page and kid status (M (~1.5h))

"Show a grown-up" opens a full-screen wish card:
- The creature and its name.
- A big 8-character code (e.g. FZ7K-2Q9M) and a QR code to /w/CODE.
- One note sticker from three presets.
- A single calm status line that polls: Waiting for a grown-up → A grown-up is looking → Ordered! → Gathering your bricks → Packing → On its way → It's here!

The wish freezes the exact revision the kid saw.

The grown-up opens /w/CODE on their own phone, or types the code at /w. First comes a neutral age screen: "What year were you born?", with an empty field, no default and nothing stored. Then they see:
- The creature in 3D (cad mode) plus a plain "Real bricks" iso render.
- The kid's note and the Creature Card.
- "Invented by BraveOtter42".
- Piece and step counts and "about N minutes to build".
- "Suitable 6+ (small parts)".
- What arrives: one parcel of genuine new parts, plus a personalized PDF booklet to print or open on a tablet.
- The fixed price including delivery and taxes.
- Trust lines in plain words: every brick connects in our digital build check; physical test build not yet done for this design; a SIMULATION banner while simulated.
- One button: "Order these bricks".

The button copies the frozen design into the grown-up's own session and continues into the existing checkout.

**Acceptance criteria**

- Creating a wish takes only a note id from a fixed enum, and the kid device never sends a name, email or phone number. The code is 8 characters from a 31-character unambiguous alphabet (about 40 bits).
- /w/CODE in a second browser (different cookie) shows the creature exactly as frozen, even after the kid keeps editing. Claim creates a new design owned by the grown-up's cookie with identical params and structuralKey, and the kid's design is untouched.
- Age screen: the field starts empty with no default. A year that makes the person under 18 hides the price and order button and shows "Please ask a grown-up to finish". No DB row or cookie is written by the age screen.
- /design/[id]/checkout for a lab-kit design returns 404 unless that design was created by a wish claim. Kids cannot reach checkout from the Lab.
- GET /api/wishes/[code]/status returns only {stage}. It never returns price, contact, address or order id, and it returns 404 unless the caller's cookie owns the wish's source design.
- Unknown or expired codes show a friendly "This wish code isn't active" page. Wishes expire 30 days after creation unless ordered. One IP gets HTTP 429 after 30 lookups per minute.
- An orders test drives a wish-claimed creature order through the simulator to delivered and asserts the kid stage sequence only moves forward. An exception keeps the stage it was held from and shows 'Taking a little longer'; canceled or refunded go back to 'Waiting for a grown-up'.

**Implementation plan**

1. Migration db/migrations/002_creature_lab.sql:
   - CREATE TABLE wishes(code text PRIMARY KEY, design_id uuid NOT NULL REFERENCES designs(id), design_revision_id uuid NOT NULL REFERENCES design_revisions(id), note text NOT NULL CHECK (note IN ('invented','together','special_day')), status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','seen','ordered')), claimed_design_id uuid REFERENCES designs(id), order_id uuid REFERENCES orders(id), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL).
   - ALTER TABLE orders ADD COLUMN fixed_price_cents integer, ADD COLUMN wish_code text.
2. src/lib/wishes.ts:
   - createWish(cid, designId, note): uses loadOwned and freezes current_revision_id; the code comes from crypto.randomInt.
   - getWishForGrownup(code): checks expiry, sets status 'seen', and returns the frozen model, stats and identity only.
   - claimWish(adultCid, code): calls a new createDesignFromRevision(customerId, revisionId, source 'wish') in designs.ts, which inserts a designs row with the creature name and calls insertRevision(params, 'wish', `From wish ${code}`). It sets claimed_design_id and returns the new design id.
   - kidStage(status, held_from_status), a pure mapping: draft/validating/quoting/awaiting_acceptance → ordered; payment_authorized/procuring → gathering; purchased → packing; shipped → on_the_way; delivered → arrived; exception → stage of held_from_status plus a 'slow' flag; canceled/refunded → waiting.
3. Routes:
   - POST /api/designs/[id]/wish
   - GET /api/wishes/[code]/status (owner of the source design only)
   - POST /api/wishes/[code]/claim (adult cookie created on demand)
4. Pages:
   - src/app/w/page.tsx: a code entry form.
   - src/app/w/[code]/page.tsx: server component plus a client AgeGate. Build time = steps x 4 min, rounded to 5.
5. createOrder in src/lib/orders/service.ts: if the template is a lab kit, require that a wishes row has claimed_design_id = designId. Set fixed_price_cents from settings and wish_code. In the same transaction set wishes.status = 'ordered' and order_id.
6. Rate limit: a small in-memory per-IP token bucket in src/lib/http.ts, used by the wish lookup routes.
7. QR: add qrcode@1.5.4 (pinned to that exact version) and render SVG client-side. If the owner declines the dependency, show the code and URL only.
8. The kid card polls status every 10 s while the page is visible.

### One fixed creature price (S (~30m))

Every creature kit has one fixed price, shown up front only to the grown-up. The default is $24.00 including delivery and taxes, and the owner can change it in admin settings. The kid never sees money.

The existing supplier quote, limits and contribution checks still run, so margin stays protected and routine orders still need no owner intervention. Ready-made kits keep today's estimate-then-quote pricing.

This removes per-piece math from the parent decision, and the price is known before the kid falls in love with a design. At the worst-case combination, about $12.82 simulated supplier cost plus about $1.00 payment fee, $24 leaves about $10 contribution.

**Acceptance criteria**

- A simulated creature order's quote has customer_total_cents === settings.creaturePriceCents, service_fee_cents === price - supplier_total_cents, and contribution_cents ≥ minContributionCents.
- With the simulator's priceDriftPercent set to 150, the creature order raises the existing contribution_below_minimum exception and never charges more than the fixed price, so existing protections are preserved.
- Margin guard test over the covering set, the sample and (in the exhaustive job) all 4,860 combinations: estimated supplier total + paymentFeeEstimate(price) + minContributionCents ≤ 0.8 x price. That leaves a 20% buffer for drift.
- Kid routes (/lab, wish card, status) never render a currency string. The grown-up page, checkout and OrderView label it 'Fixed price, includes delivery and taxes' plus the SIMULATION label while simulated.

**Implementation plan**

1. Settings (src/lib/settings.ts): add creaturePriceCents to OperatingSettings and DEFAULT_SETTINGS (2400). Add it to validateSettings' non-negative list and to src/components/admin/SettingsForm.tsx.
2. storeQuote (src/lib/orders/workflow.ts): when o.fixed_price_cents is set, customerTotal = o.fixed_price_cents and fee = customerTotal - sq.totalCents. Compute payFee and contribution exactly as today. The existing maxOrderSupplierCents and minContributionCents checks in quoteHandler then guard margin unchanged.
3. Checkout page (src/app/design/[id]/checkout/page.tsx): for lab kits, show the fixed price instead of the estimate.
4. Add the margin guard to tests/creature.test.ts. Add an orders test in tests/orders.test.ts.

### Personalized Creature Pack PDF (S (~45m))

The instructions PDF for a creature order becomes the kid's keepsake. Physical inserts aren't possible yet because suppliers drop-ship loose parts.
- Cover: a big render, the creature's name at 34 pt, "Invented by BraveOtter42", "No. BL-7K2Q9 · Born 12 Oct 2026" and the power.
- Page 2: a cut-out Creature Card (63x88 mm, dashed cut lines, render, stat pips) and a Certificate of Invention with a blank "Builder: ____________" line, so the kid writes their own name by hand and we never collect it.
- Steps are named after body parts.
- The final step reads: "Power up! Make a wish, then click Captain Fizzfang's power core into place."

The SIMULATED ORDER label stays on every page, along with the small-parts warning and the honest physical-test line. There is no '1 of 1' claim.

**Acceptance criteria**

- For a creature order, the PDF text contains the creature name, 'Invented by <tag>', a 'No. BL-' serial, the card and certificate page, and the wish line on the last step page. Every page carries the mode label.
- The PDF contains none of the adult purchaser's name, email or address (test: extract text and search for the contact fields).
- Ready-made kit PDFs keep the same page count and cover text as before.
- The design-preview PDF (/api/designs/[id]/instructions) prints 'PREVIEW' instead of a serial.
- No PDF contains the strings '1 of 1' or 'only one'.

**Implementation plan**

1. src/lib/instructions/pdf.ts:
   - Extend InstructionOptions with creature?: { name, builder, serial, bornOn, power, stats }.
   - When it is present: draw the cover variant; insert a page after the cover with the card (renderIso of the model, 5 pip rows, dashed rectangle at 178x249 pt) and the certificate; bump totalPages; substitute {name} in step notes. The 'Power up!' extraStep note is authored as 'Make a wish, then click {name}'s power core into place.'
2. src/app/api/orders/[id]/instructions/route.ts:
   - Build the creature block from o.frozen_model.params.identity (renderName, renderBuilder), powerOf(core color) and creatureStats(o.frozen_model).
   - Serial = 'BL-' + the first 5 characters of the base32-encoded order id, uppercased.
   - bornOn = design_revisions.created_at of o.design_revision_id. Add that column to getOrderModelForInstructions.
   - Title the PDF with the creature name instead of 'Order 1a2b3c4d'.

## Parent flow

Only adults buy, and nothing on the grown-up side asks about the child.

1. **The grown-up finds out.** The kid shows the wish card on the family tablet, or reads out the 8-character code. The grown-up scans the QR code, or types the code at /w on their own phone. A grown-up on the same tablet works too.
2. **Neutral age screen.** "What year were you born?" with an empty field, no default and nothing stored. Under 18 shows "Please ask a grown-up to finish".
3. **The creature page** answers what parents check before buying:
   - The kid's creature turning in 3D, plus a still "Real bricks" render, so the on-screen animation doesn't oversell a static model.
   - The kid's note ("I invented this!") and the Creature Card.
   - "Invented by BraveOtter42".
   - Piece count, steps and about how many minutes to build.
   - "Suitable 6+, contains small parts".
   - What arrives: one parcel of genuine new parts, plus a personalized PDF booklet with a cut-out card and certificate to print.
   - One fixed price including delivery and taxes ($24.00 by default), set before the kid started designing.
   - Plain-language trust lines: every brick connects in our digital build check; physical test build not yet done for this design.
   - The SIMULATION banner while orders are simulated.
4. **Order these bricks.** The frozen design is copied into the grown-up's own session. Then the existing adult checkout runs: name, email and delivery address, the 18+ checkbox, the supplier quote at the fixed price, accept and simulated authorization, procurement, and shipping updates.
   - Order emails go only to the adult and keep the [SIMULATION] prefix.
   - The adult's OrderView shows the fixed price and links the personalized PDF.
5. **Not now.** Closing the page changes nothing on the kid's side beyond "A grown-up is looking". There are no reminders to the kid, no nagging and no expiry pressure. The kid's design stays in the Lab, and the code stays valid for 30 days.
6. **After delivery.** The grown-up prints the PDF, or opens it on a tablet. The kid writes their own name on the certificate by hand, cuts out the card, builds, and places the power core last.

How we pitch it to parents: your kid invented it; we find every genuine brick and send it in one box; a 30-minute screen-free build; one price up front with no in-app purchases; we collect nothing about your child.

## Kid safety rules

- No free text anywhere a child can reach (/lab, wish card, status). Creature names and builder tags come from curated word lists stored as integer indices, and set_identity rejects anything else.
- In kid mode the chat (LLM), photo upload and rename features are not rendered. Their APIs return 404 for lab-kit designs, so no child text or image ever reaches src/lib/edit/llm.ts, design_messages or uploads.
- No accounts, emails, real names, photos, voice, location, birthdays or age questions on the kid side. The only identifier is the existing signed anonymous bl_customer cookie, used solely for internal operations (keeping designs on the device).
- No third-party scripts, analytics, ad pixels or external fonts on kid routes. On-device WebAudio sound only, with no network audio or speech.
- The kid side never shows money. There are no timers, countdowns, streaks, scarcity messages, repeat 'ask again' prompts or decline messages. 'Show a grown-up' is opt-in, and the wish status only moves forward or rests at 'Waiting for a grown-up'.
- No paid randomness. The Shuffle lever is free and only changes designs.
- A child never sees a validation error or warning. Every reachable choice is buildable by construction, proven by the exhaustive test, and every order is re-validated on the frozen model as it is today.
- Only adults buy. A neutral birth-year screen (empty, no default, nothing stored), the existing 18+ checkbox and parseContact come before any order. A lab-kit design can reach checkout only through a wish claim, never from the Lab. Contact, address and payment stay in orders.contact.
- Wish codes are random (about 40 bits), rate-limited (30 lookups per minute per IP) and expire after 30 days if unordered. The grown-up page shows only creature data and the generated builder tag. The kid status endpoint returns only a stage enum, and only to the cookie that owns the source design.
- Every name and builder-tag combination passes an automated blocklist test (profanity, slurs, real-first-name list) before a word list ships, plus human review of each list.
- Honest claims only. No '1 of 1' or 'only one in the world' until a hash check across all orders exists. 'Physical test build: not yet' is shown wherever it applies. Every simulated quote, order, email and PDF page keeps its SIMULATION label.
- Physical safety: every booklet keeps 'Contains small parts. Not for children under 3', and creatures are labeled 6+ because of 1x1 round parts. Live orders remain blocked by the existing physical-validation gate until per-module test builds exist.
- Before /lab is public: publish the COPPA online notice and a written retention policy (unordered kid-mode designs deleted after 90 days idle, wishes after 30 days), run a legal review, and ship the retention job.

## UX principles

- Alive in under 10 seconds, finished in under 2 minutes: the Lab opens on a random living creature, and a named, colored creature with a power is about a dozen taps away.
- Taps, not typing: every choice is a big picture tile (at least 72 px, at least 48 px for any control), labeled with an icon plus 1-2 words, so a 5-year-old pre-reader can use it.
- Show the result, not the option: each tile is a render of THIS creature with that choice.
- Every tap gets a reaction within about 300 ms: a client-side compile, the new bricks dropping in, a pop sound and stat pips wiggling.
- No fail states: nothing locked, nothing red, no error text. If it's on screen, it's buildable.
- Authorship is everywhere: the creature's name and 'Invented by <tag>' appear on the card, wish card, grown-up page and PDF cover. The kid writes their real name on paper themselves.
- Stats teach cause and effect, never judgment: they are calculated from real bricks and move when parts change, with no overall score or ranking.
- The physical promise stays visible and honest: a brick counter, 'These N real bricks can come to your house', a reveal in true build order, and a still 'Real bricks' render for grown-ups.
- One tap undoes anything, including a whole shuffle.
- Kids see wonder, grown-ups see facts: no money on the kid side; one fixed price, contents and trust lines on the grown-up side.
- Calm by design: no timers, streaks or nags. Respect prefers-reduced-motion, and offer a persistent mute button.

## Remove / demote

- Home page hero ('Build something that's yours... chatting... quote'): replace it with the kid-first Creature Lab hero. Move the six fixed kits below it as 'Ready-made kits' for grown-ups and older builders. Their editor stays as it is.
- For creatures, replace the cost-plus 'about $X delivered (estimate, not a quote)' with one fixed price shown only on the grown-up page and at checkout.
- In the Lab: remove free-text LLM chat, photo uploads, rename, the parts list table, CSV and BrickLink XML exports, revision numbers, price estimates, budget suggestions and validation warnings. They stay in /design/[id] for ready-made kits and in admin.
- Disable budgetSuggestions() for lab kits. Its cartesian product would compile all 4,860 creatures per request.
- Color stops being the main customization. It becomes a one-tap world palette plus per-zone swatches after shape and face.
- Not adopted: 'only one in the world' or '1 of 1' copy (unverifiable for now); the Spark Letter second mail piece and numbered or sealed bags (drop-ship suppliers can't do them); Mega scale-2 voxel doubling (turns slopes into sawtooths); Realm base plates (leave wheeled creatures ungrounded); Brick Vault subset remix (rarely finds a subset); purchase-gated Sketch/Awake states, ranks, badges and empty-shelf silhouettes (built-in pester power); the Hatch Pass gift card (payments and stored-value risk); storing an age band or birthday against the cookie.
- Demoted from first step to a palette: island and world maps with world-exclusive parts. They come back later as monthly content drops.
- Deferred to later: wake-up page, secret combos, idea buttons, auto-accept, family gifting, buddies, sorting mat, physical inserts, Little builder mode, Build Together.

## Later

- **Wake-up page (physical-to-digital twin)**: /c/[serial] is printed as a QR code on the booklet cover and needs no login. It shows rotatable 3D steps (reusing BrickViewer uptoStep/highlightStep) with 'I did it!' ticks per step. The final 'Power up!' plays the glow-and-blink animation and stamps the card AWAKE. Progress is stored against the order serial only, never against a child.
- **Secret combos sticker book**: About 12 hidden combinations, e.g. Chomper + Whip + Spikes = 'T-Rex Mode!' or Wheels + Wings = 'Flying Car'. They trigger a fanfare and a special move. Discoveries fill a sticker book with silhouettes for the ones not yet found. It runs client-only, stored in localStorage with try/catch, is free, and never needs a purchase.
- **Idea buttons**: Big buttons for pre-readers: Make it fly / faster / spikier / sillier / cuter. Each one swaps one tagged module through the same deterministic set_option calls and reads its label aloud on tap. They replace any need for chat in kid mode.
- **Module pack 2 and a Big size**: More silhouettes and functions, not recolors, so the novelty doesn't fade the way it did for Mixels:
- Heads: shark, owl, frog, dragon.
- Arms and claws.
- Toe slopes, tiled backs, a mouth with teeth.
- A Big body family of 70-140 pieces at a second fixed price.

Each pack must keep the exhaustive validation test green and bump KitDef.version. Scale-2 voxel doubling is not used, because it breaks 2-deep slopes.
- **Per-module physical validation**: Re-key the live-fulfillment gate (validation/physical.ts and orders/workflow.ts) from per-structuralKey to per-module coverage: about 24 test builds, each module on its worst-case host, plus wheel spacing and the core socket. This is required before any live creature order, because 4,860 per-key test builds are impossible.
- **Quote auto-accept at the fixed price**: Collect the payment method at checkout. When the quote equals the fixed price and passes the existing limit and contribution checks, accept and authorize automatically, so the grown-up never comes back to approve a quote.
- **Send to family and Save for a special day**: Two grown-up-side actions:
- A signed family link lets a grandparent see the gift framing and check out as an adult.
- A deliver-by date sends one reminder email to the adult, timed to the real lead time.

The kid only sees 'Saved for a special day'. No child data is collected.
- **Kid-safe hatch tracker page**: A /hatch/[token] page reached from a random token that the adult can share with the kid. An egg cracks a little more at each real order stage and shows 'about N sleeps' from estimated_delivery_at. It shows no price, address or adult name.
- **Combo-socket buddies**: A small second creature that clicks onto one already at home, as a rider or sidekick, at a lower price. Both the union model and the buddy on its own must pass validateModel, which the judges flagged. The buddy's BOM excludes the host's parts.
- **1:1 sorting mat page**: A printable page that places each stage's bricks on true-size outlines (8 mm per stud), with a fold-over 'Secret! Open at the last step' pocket for the power core. It turns the supplier's loose parts into a staged reveal.
- **Physical inserts when kitting allows**: Once there is own kitting or a 3PL: a printed cardstock card and certificate, a name sticker sheet, a sealed 'open last' core bag, and an inner sticker that says 'Delivery for: Captain Fizzfang'. The shipping label still goes to the adult.
- **My creatures shelf and monthly design challenges**: A device-local shelf of saved creatures (from the existing anonymous cookie and listDesigns) and monthly original themes such as 'a creature that lives in a volcano'. Later, a moderated Hall of Fame that a parent submits to, credited only by builder tag, with no chat.
- **Little builder mode and Build Together**: Little builder mode is a chunky-only module subset with fewer steps for ages 4-5, passed to candidatesFor() as an exclusion list. Build Together offers two-track instructions; it needs step_order support for parallel sub-assemblies first.
- **Retention job and privacy notice tooling**: A scheduled job that deletes unordered kid-mode designs idle for over 90 days and expired wishes. It also covers the published COPPA notice and a written retention policy. These are required before /lab is publicly launched.

## Open questions for the owner

- Price: is $24.00 including delivery and taxes right for every creature (29-61 pieces; worst-case simulated supplier cost about $12.82, leaving about $10 contribution)? Or do you want a different number, or a second 'Big' tier later?
- Home page: should Creature Lab become the home hero for everyone, with the six kits below? Or should it live at /lab with the current adult-oriented home page unchanged?
- Physical validation: do you approve re-keying the live-order gate from per-configuration to per-module test builds (about 24 builds, each module on its worst-case host)? Who will do those builds? No live creature order can ship until they exist.
- Is PDF-only personalization acceptable for v1, with the parent printing the card and certificate? Or should we budget for own kitting or a print step (cardstock card, sticker sheet, sealed core bag), which would need a vendor and may need owner handling?
- Legal: who will review the COPPA notice and retention policy (90-day deletion of unordered kid designs, 30-day wishes) before /lab is public? Are UK/EU customers in scope, which brings in the Children's Code?
- Age label: 6+ (because of 1x1 round parts and pupils) or 5+ once a chunky-only Little builder mode exists?
- Is keeping the explicit quote-acceptance step acceptable for v1 at a fixed price, or should quote auto-accept be the next thing built?
- May we add one small pinned dependency (qrcode@1.5.4) for the wish-card QR, or should v1 show only the typed code and URL?
- Content budget: who designs the planned 3-4 original modules per month (original shapes only, no LEGO set or Mixels lookalikes, reviewed against a checklist)?
- Can the three new trans core colors (red, yellow, green) be sourced reliably by the eventual supplier? If not, should trans-clear be the automatic fallback with parent approval?
