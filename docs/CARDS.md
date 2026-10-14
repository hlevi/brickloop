# BrickLoop Cards: product spec

Greeting cards you build. Every BrickLoop card arrives with a pouch of real bricks and a printed instruction leaflet. The person who opens it builds a small keepsake that stands on the card: a mini model (a cake, a rose, a rocket) or a brick mosaic. The buyer picks a card or designs a mosaic, personalizes it, and checks out. BrickLoop then orders exactly the parts needed, prints the card, packs it and ships it.

This replaces the earlier kit shop and the Creature Lab. The order engine (quotes, payment authorization, procurement checks, exceptions, admin) is reused.

## 1. The experience

**The shop feels like a premium card brand, not a toy store.** It borrows the general feel of a high-end pop-up card shop: calm cream backgrounds, an elegant serif display face, big product imagery on soft colors, browsing by occasion, and a personalization panel next to a live preview. It must not copy any real brand's name, logo, wording, artwork or layouts.

**The pop-up moment.** A paper pop-up card wows when it opens. Ours does the same on screen. On the product page the card's cover swings open (CSS 3D), and inside, bricks drop in one by one and assemble into the model (the BrickViewer reveal). Later the recipient builds it for real.

**Core loop**

1. Browse by occasion: Birthday, Love & Anniversary, Thank You, Congratulations, New Baby, Wedding, Holidays, Thinking of You, New Home, Just Because.
2. Open a card's page. A gallery shows the cover, the opened card and the built model in 3D, plus what's in the box.
3. Personalize it:
   - the build's colors and options (bounded, validated),
   - the cover headline (pick a suggestion or type up to 40 characters) and cover theme,
   - the inside message, sign-off and lettering style.

   The preview updates live, and the price is always visible.
4. "Send this card": choose "send it for me" (straight to the recipient) or "send it to me", and optionally a ship date. The adult purchaser enters contact details, then pays.
5. Follow the order on the timeline:
   1. Ordered
   2. Bricks ordered
   3. Bricks arrived at the studio
   4. Card printed and packed (with the ship date shown if scheduled)
   5. Shipped
   6. Delivered

**Create your own.** A brick-mosaic designer (8 x 8 or 16 x 16 studs) that anyone can use:

- paint pixels from the brick palette,
- stamp letters and numbers (initials, "30", "MOM", "LOVE"),
- drop in ready-made pictures (heart, star, balloon, flower, and more),
- or turn a photo into a mosaic. The photo is processed in the browser and never uploaded.

Then they pick the cover and message, exactly like a ready-made card.

## 2. The physical product

- **The card:** a folded square card, 6 x 6 in (152 mm), on heavy stock. It ships in a slim gift box, about 6.5 x 6.5 x 1.25 in, holding the card, sealed parts bag(s), the instruction leaflet, and the base plate for mosaics.
- **Front:** the printed cover (`src/lib/cards/cover.ts`): theme stock and pattern, the brick art, and the headline.
- **Inside left:** the message and sign-off, printed in the chosen lettering.
- **Inside right:** "Build me!", with the piece count, build time and a small picture of the finished model.
- **Back:** the card title, "Designed by BrickLoop", and the small-parts warning.
- **The leaflet:** cover, parts list, then one step per page. For mosaics it shows a color map per group of rows.
- **Warning** on the card back, the leaflet and the product page: "Contains small parts. Not for children under 3 years."

## 3. Catalog

Each card is a `CardDef` in `src/lib/cards/defs/*.ts` pointing at a kit (a voxel blueprint in `src/lib/model/templates/`) or a mosaic preset (`src/lib/cards/presets.ts`). All designs are original. Do not copy or imitate any specific commercial set, card or artwork.

| Group | Owner | Cards and kits (kit ids) |
|---|---|---|
| core (done) | foundation | puppy-love (pup), race-day (racer), roar-some (dino), home-sweet-home (cottage), out-of-this-world (rocket), little-bonsai (bonsai), brick-heart (mosaic), custom-mosaic (hidden blank canvas) |
| A | kits-a | birthday-cake + wedding-cake (kit `cake`: 1-3 tiers, frosting, candles or a heart topper), party-balloons (kit `balloons`: 3 or 5 balloons on a weighted base), gift-box (kit `giftbox`: box with ribbon and bow), sweet-heart (kit `heart`: a 3D heart on a little stand) |
| B | kits-b | red-rose (kit `rose`: one long-stem rose in a vase), tulip-pot (kit `tulips`: 3 or 5 tulips in a pot), winner-trophy (kit `trophy`: cup on a plinth, gold or silver), baby-blocks (kit `blocks`: a stack of three pastel toy blocks) |
| C | kits-c | holiday-tree (kit `xmastree`: tree with ornaments and a star), snowman (kit `snowman`), jack-o-lantern (kit `pumpkin`: a carved face option), cozy-mug (kit `mug`: a mug with rising steam, for get well, thanks or thinking of you) |
| mosaics | mosaic | at least 8 preset mosaic cards (e.g. birthday balloons, LOVE letters, sunflower, gold star, snowflake, paw print, baby bear, a monogram), presets in `presets.ts`, cards in `defs/mosaics.ts` |

**Build size.** Card builds should be small: about 25 to 90 pieces, with a footprint of 8 x 8 studs or less where possible. They must stand stably and look great from the front-left iso view.

**Coverage.** At the end, every occasion has at least 3 listed cards, and at least 2 featured cards appear on the home page.

## 4. Price

One fixed price per tier (`src/lib/cards/pricing.ts`). It includes the bricks, printing, packing, delivery and taxes:

| Tier | Rule | Default |
|---|---|---|
| Mini build | 45 pieces or fewer | $19 |
| Classic build | 46 to 90 pieces | $25 |
| Grand build | more than 90 pieces | $34 |
| Mini mosaic | 8 x 8 | $22 |
| Mosaic | 16 x 16 | $36 |

- The owner changes these in Admin, under Settings (`settings.cardPrices`).
- The product page, checkout, order page and emails all show the same number.
- Checkout sends `expectedPriceCents`. If the price changed in the meantime, the order is refused with a clear message and nothing is charged.
- **Supplier cost rises:** if the supplier's cost rises after acceptance but the contribution stays at or above the minimum, the card ships at the same price with no customer action. If it doesn't, the owner gets an exception. The customer is never asked to approve a "new price", because the price did not change. Admin and order pages show the internal breakdown (supplier cost, contribution) only to the owner.

## 5. Pages and ownership

| Route | What | Owner |
|---|---|---|
| `/` | Home: hero with an animated card, occasion row, "Our favorites", how it works, Create-your-own banner, trust and simulation notes | shop-ui |
| `/cards` (`?occasion=`) | All cards with occasion chips | shop-ui |
| `/cards/[cardId]` | Product page: gallery, open-card preview with brick reveal, personalizer, price, "Send this card" | shop-ui |
| `/cards/[cardId]/cover.svg` | Cached cover image for the grid and social previews (`Cache-Control`; never inline huge SVGs in lists) | shop-ui |
| `/api/cards/[cardId]/preview` | Stateless preview: `{calls}` in, `{model.parts, steps, validation status, tier, priceCents, cover svg}` out (`previewCard`) | shop-ui |
| `/design/[id]` | "Your card": a saved design with Edit, Preview and Checkout | shop-ui |
| `/designs` | Saved cards | shop-ui |
| `/about` | How it works, what's real and what's simulated | shop-ui |
| `/create` | Create hub: blank mosaic, start from a picture, start from a photo | mosaic |
| `/create/mosaic` (`?design=` or `?preset=`) | Mosaic designer | mosaic |
| `/checkout/[designId]` | Checkout | orders |
| `/orders`, `/orders/[id]` | Orders and the timeline | orders |
| `/admin/**` | Owner dashboard, including the new Packing queue | orders |
| `/api/orders/[id]/card` | Print-ready card PDF (the purchaser who owns it, or admin) | print |
| `/api/orders/[id]/instructions`, `/api/designs/[id]/instructions` | Instruction leaflet | print |

**File ownership.** Edit only what your area owns. If you need a change elsewhere, write it down in your final report.

- **shop-ui:**
  - `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/cards/**`, `src/app/api/cards/**`, `src/app/design/**`, `src/app/designs/**`, `src/app/about/**`, `src/app/not-found.tsx`
  - `src/components/shop/**`, `src/components/BrickViewer.tsx`
  - `tests/shop-*.test.ts`
- **mosaic:**
  - `src/app/create/**`, `src/components/mosaic/**`, `src/lib/mosaic/**` (pixel font, stamps, photo quantizer, flood fill)
  - `src/lib/cards/presets.ts`, `src/lib/cards/defs/mosaics.ts`
  - `tests/mosaic-*.test.ts`
- **orders:**
  - `src/app/checkout/**`, `src/app/orders/**`, `src/app/admin/**`, `src/app/api/orders/**` (except `card/` and `instructions/`), `src/app/api/admin/**`
  - `src/components/checkout/**`, `src/components/OrderView.tsx`, `src/components/order-view.css`, `src/components/CheckoutForm.tsx`, `src/components/admin/**`
  - `src/lib/orders/**`, `src/lib/studio/**`, `src/lib/exceptions/**`, `src/lib/jobs/**`, `src/lib/settings.ts`, `src/lib/http.ts`, `src/lib/metrics.ts`
  - `db/migrations/005_*.sql`, `tests/orders.test.ts`, `tests/platform.test.ts`, `tests/studio-*.test.ts`
- **print:**
  - `src/lib/cards/cover.ts`, `src/lib/instructions/**`, `src/app/api/orders/[id]/card/**`, `src/app/api/orders/[id]/instructions/**`, `src/app/api/designs/[id]/instructions/**`
  - `tests/pdf.test.ts`, `tests/cover-*.test.ts`
- **foundation (coordinator only):**
  - `src/lib/designs.ts`, `src/lib/edit/tools.ts`, `src/lib/model/**` (except the group files)
  - `src/lib/cards/{types,catalog,themes,occasions,pricing}.ts`, `src/lib/orders/card.ts`, `db/migrations/004_*.sql`, `docs/**`, `README.md`
  - Propose changes to these in your report rather than editing them.
- **kits-a / kits-b / kits-c:**
  - `src/lib/model/templates/group-{a,b,c}.ts` (plus one file per kit in that folder)
  - `src/lib/cards/defs/group-{a,b,c}.ts`, `tests/kits-{a,b,c}.test.ts`
  - Do not change `kit.ts`, `parts.ts` or `colors.ts`. If a part or color is missing, report it.

## 6. Contracts (fixed; coordinate before changing)

- **Card domain:**
  - `src/lib/cards/types.ts`: `CardDef`, `CardBuild`, `Occasion`, `CoverTheme`.
  - `catalog.ts`: `CARDS`, `listedCards`, `getCard`, `cardsForOccasion`, `featuredCards`, `cardTemplate`, `defaultCardParams`, `CUSTOM_MOSAIC_CARD`.
  - `themes.ts`, `occasions.ts`, `presets.ts` (`MOSAIC_PRESETS`, `getPreset`, `presetCells`).
  - `pricing.ts`: `priceTier`, `pieceCount`, `tierPriceCents`, `cardPriceCents`, `TIER_LABELS`.
- **Model:**
  - `DesignParams.card` (`{cardId, headline, theme}`) and `DesignParams.mosaic` (`{cells}`). The template `"mosaic"` has options `size` ("8" or "16") and `finish` ("tile" or "dot"), and a component `base`.
  - Cells are row-major with row 0 at the top. There is one base-36 character per cell, indexing `MOSAIC_PALETTE`. The palette is append-only.
  - `src/lib/model/mosaic.ts` is client-safe.
- **Edit tools** (`src/lib/edit/tools.ts`):
  - `set_color {component, color}` and `set_option {option, value}`. Changing a mosaic's size resamples its picture.
  - `set_mosaic {cells}`.
  - `set_card {headline?, theme?}`, validated by `cleanHeadline` and the card's own themes.
  - `parseToolCalls` (at most 24 calls per request).
- **Designs** (`src/lib/designs.ts`):
  - `createCardDesign(customerId, cardId, calls)`: strict, so any invalid call means a 400.
  - `previewCard(cardId, calls)`: stateless.
  - `getDesignView` returns `card`, `tier` and `priceCents`.
  - `applyEdits`, `undo`, `reset`: reset goes back to the card's defaults.
  - `POST /api/designs {cardId, calls?}` returns `{id}`. `POST /api/designs/[id]/edit {calls}`.
- **Message draft handoff:**
  - Before navigating to checkout, the product page and the mosaic designer write `sessionStorage["brickloop:card-draft:<designId>"] = JSON.stringify({ message, signature, font })`. Checkout pre-fills from it.
  - The message never goes into the design itself (designs hold no personal text beyond the cover headline).
- **Orders:**
  - `orders.card` holds `CardOrderDetails` (`src/lib/orders/card.ts`): `{cardId, title, headline, theme, message, signature, font, sendTo, recipient, shipOn}`. `orders.ship_on` and `orders.personal_data_purged_at` are also new.
  - `createOrder(customerId, {designId, contact, adultConfirmed, card, expectedPriceCents})`.
  - Fonts: `classic` (serif), `script` (handwritten feel), `print` (clean sans).
- **Cover** (`src/lib/cards/cover.ts`): `coverInputFor(model, headline?, theme?)`, `coverLayout`, `coverSvg`, `shapesToSvg`, `CoverShape`, `COVER_SIZE`. The PDF draws the same `CoverShape[]`.

### Design tokens and shared classes (for every UI area)

- **Tokens.** shop-ui owns the values in `globals.css`. Everyone uses the names:
  - existing: `--bg`, `--panel`, `--ink`, `--muted`, `--line`, `--brand`, `--brand-ink`, `--accent`, `--ok`, `--warn`, `--bad`, `--sim`, `--radius`, `--shadow`
  - new from shop-ui: `--font-display` (serif display face), `--font-body`, `--surface-2` (soft tinted panel), `--radius-lg`
- **Fallbacks.** Areas styling before shop-ui lands write `var(--font-display, Georgia, serif)` and so on.
- **Shared classes.** These keep working; shop-ui may restyle them but not rename them: `.btn`, `.btn.primary`, `.panel`, `.field`, `.notice` (`.ok`, `.bad`, `.sim`), `.badge.sim`, `.stack`, `.row`, `.grid`, `.small`, `.muted`, `.mono`, `.error`, `.container`, `.sim-banner`.
- **Area CSS.** Each area keeps its own CSS in its own folder (e.g. `src/components/checkout/checkout.css`), imported by its pages.

## 7. Order and fulfillment model

- **Parts and studio.** Parts are bought per order from the supplier (simulated), shipped to the BrickLoop studio address (settings) rather than the customer. At the studio the card is printed, packed with the parts and leaflet, and shipped to the recipient or the buyer.
- **States:** `purchased` (parts bought, payment captured), then `packing` (parts arrived at the studio, card printing and packing, held until `ship_on` if set), then `shipped` (studio dispatched, outbound tracking), then `delivered`. `exception`, `canceled` and `refunded` work as before.
- **Studio adapter:** `src/lib/studio/` has the same capability-flag pattern as suppliers.
  - The simulated studio receives parts when the supplier shipment is delivered, prints, packs, waits for `ship_on`, ships and delivers, on the simulator's timing.
  - The real studio is the owner, working through the Admin Packing queue: download the print PDF and leaflet, mark packed, enter carrier and tracking.
  - Live readiness stays blocked until a real studio process and supplier are verified.
- **Who sees what:**
  - The purchaser sees the order timeline, the card proof (PDF) and the leaflet.
  - Only the owner sees supplier costs, contribution and internal notes.
  - Emails go to the purchaser only, never quote the inside message, and keep the `[SIMULATION]` prefix while simulated.
- **Privacy:**
  - The message, sign-off and recipient address live only in `orders.card`. They are never logged and never written to audit events.
  - A retention job purges them a set number of days after delivery (setting, default 30). It keeps the card id and the recipient's country and region for metrics, and sets `personal_data_purged_at`.
  - No ages or birthdays are asked for.
  - The purchaser must confirm they are 18 or older.

## 8. Safety and honesty rules (kept from the original spec)

- **Simulation labeling.** Simulated quotes, payments, purchases, printing and shipments are visibly labeled as simulated in the UI, emails, PDFs and records. Never present them as real.
- **No spending or live operation** without verified supplier capabilities, real credentials, spending limits and explicit owner authorization. Do not infer purchasing or shipping capability from a catalog API.
- **Original designs only.** No scraped or copied community or commercial designs, no third-party trademarks in our branding, and no product imagery that is not ours.
- **No invented social proof:** no fake reviews, ratings, "bestseller" labels, scarcity or countdown timers, and no fake discounts.
- **Children:**
  - Cards may be for children, but only adults buy them.
  - We collect nothing about children beyond what an adult types to address the card, and we purge that after delivery.
  - Small-parts warnings appear wherever the product is described.
- **Secrets and personal data** never appear in logs.
- **Accessibility:**
  - WCAG AA contrast.
  - Full keyboard use.
  - Visible focus.
  - `prefers-reduced-motion` turns the open-card and brick animations into a simple fade.
  - Forms have labels and errors.
- **Performance:**
  - Product grids use cached cover image URLs, not inline SVG.
  - The 3D viewer loads only on product and preview pages.
  - The home page loads no WebGL.

## 9. Acceptance criteria

- Every listed card builds a digitally valid model for its default params, and for every option combination in kits A, B and C.
- Every occasion has at least 3 listed cards.
- A shopper can go from the home page to a delivered (simulated) order for a ready-made card and for a self-designed mosaic, with the message pre-filled from the personalizer and the same price everywhere.
- Changing a color, option, headline or theme updates the preview within about 300 ms on a mid-range laptop. Mosaic painting is instant (client-side).
- The open-card preview works with a mouse, touch and keyboard, and degrades to static images without WebGL.
- Each order produces:
  - a print-ready card PDF: front, inside spread and back, at 6 x 6 in plus bleed, with the message in the chosen lettering;
  - a leaflet, with color maps for mosaics.

  Neither shows the purchaser's contact details. The card PDF shows the recipient's name only if the buyer wrote it in the message.
- The owner's Packing queue lists orders whose parts have arrived, with print files, "Mark packed" and "Mark shipped" (carrier and tracking). The simulated studio does this automatically.
- Personal data is purged after the retention period (tested).
- No horizontal scroll at 360 px. Lighthouse-style basics: labels, alt text, contrast and focus.

## 10. Open questions for the owner

- **Prices** for the tiers (the defaults above are placeholders that cover simulated costs plus printing and two shipments).
- **Fulfillment.** Parts are bought per order and shipped to a studio. Bulk inventory would cut cost and delivery time.
- **Print partner and box supplier.** Not chosen. The print PDF follows a generic 6 x 6 in + 0.125 in bleed spec.
- **Legal review** of child-recipient data handling and the small-parts warnings for target markets.
- **Brand name** for the card line (currently "BrickLoop Cards").
