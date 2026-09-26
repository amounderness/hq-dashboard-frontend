# Switchboard identity — decision record

Approved 26 September 2026. The Ward Mosaic, wordmark, subtitle and palette are the site identity for the Leeds pilot.

## Agreed

- The product and wordmark are **switchboard**, written as one continuous word. The colour change at “board” may remain, but it must not introduce a visual gap or suggest two words.
- The preferred interface palette is **deep petrol** `#1D6568`, **graphite** `#1E3038`, and **white** `#FFFFFF`. A very light warm neutral such as `#F7F8F6` may be used for the page background. Keep this palette visually separate from the party colours used in election charts and maps.
- The approved subtitle is **Electoral Intelligence**. It sits beneath the wordmark; the header needs no second slogan.
- The approved mark is the [Ward Mosaic](brand-icon-ward-mosaic.svg): four touching areas with one set of shared white borders forming a flat square, inside a pale turquoise rounded-square background. No node appears at the centre.
- The identity should feel clean, professional, analytical and practical for a private electoral workspace.

## Production assets

- [Brandboard SVG](switchboard-brandboard.svg) and [PNG](switchboard-brandboard.png) show the mark at header, 128, 64, 48, 32 and 16-pixel sizes with the wordmark, subtitle and palette.
- The website header uses `public/switchboard-mark.svg`; the browser uses `public/favicon.svg` with a multi-size `src/app/favicon.ico` fallback. These are derived from the same approved vector geometry.
- Petrol is the interface accent; graphite is the primary text colour; white is used for panels; pale turquoise `#E8F2F0` is used for active/navigation surfaces and the icon background. Election-result party colours and the turnout scale remain data colours.

## Ward Mosaic geometry

- Background: the original very pale turquoise `#E8F2F0`, with a rounded-square outside edge.
- Inside: four adjoining coloured ward shapes occupy a **flat-edged square**. Their coordinates share boundaries exactly, so the tiles touch; a single white boundary network and white square outline are drawn above them. This avoids doubled strokes and unintended gaps.
- The central node and all other dots are removed. The four tile shades remain close to the original concept. They are brand marks, not election-result party colours or real Leeds wards.
- The [fifth sheet](brand-map-icon-round5.svg) records the approved shape before site implementation. At 24 pixels, the white seams scale to just under one pixel.

## Earlier map-icon shortlist

- **01 / Balanced Mosaic:** Five adjoining areas, each large enough to read when the icon is reduced. It keeps the friendly multi-area feel of the first Ward Mosaic; the centre uses deep petrol, but no ward is explicitly selected.
- **03 / Selected Ward:** Neighbouring areas use quieter shades; one central ward uses deep petrol with a single white outline. This is closest to the Explorer's selection behaviour. The earlier nodes and double outline have been removed.
- Both have a square outer frame with **flat sides and lightly rounded corners**, rather than the organic third-round silhouette. The [fourth sheet](brand-map-icons-round4.svg) includes 64, 32 and 24-pixel vector previews. At 24 pixels, the internal seams and frame are about 1.1 pixels and the selected outline about 1.3 pixels; this remains an exploratory size check, not final favicon approval.

## Earlier third-round map exploration

1. **Open Mosaic:** The closest relative of the initial Ward Mosaic. Five adjoining areas use several petrol tones, but the outer silhouette is irregular rather than square. Nodes sit at shared ward junctions.
2. **Junction Map:** The boundaries themselves read as a connected network. Six nodes mark joins and one ward is selected, linking the map and systems ideas without a separate circuit motif.
3. **Selected Ward:** A loose cluster of neighbouring areas surrounds one ward with the light-and-dark outline used by the Explorer. Its five nodes sit on the selected ward's corners; this is the most directly tied to the product interaction.

All three are abstract marks, not a real Leeds boundary. Compare them first as icons, then simplify the preferred one for a 24–32-pixel favicon, monochrome use and dark backgrounds. Do not infer the selected ward's data from the icon colours; real party/map colours remain separate.

## Earlier second-round exploration

1. **Switch matrix — networks/systems:** Three input lines are deliberately routed to outputs through a compact matrix of terminals. This replaces the letter-shaped Routed S and makes the “switchboard” concept explicit without becoming a generic hub-and-spoke network diagram. The risk is excessive detail at favicon size; test a simplified six-terminal version before adoption.
2. **Boundary focus — mapping A:** A highlighted ward is held within a restrained outline of adjacent areas. This is a redesign of the first colourful Ward mosaic, with one clear area of emphasis. It speaks directly to Explorer selection and local focus.
3. **Layered boundaries — mapping B:** A quieter outline-only regional tile uses connected boundary segments, with one filled area. This explores a more institutional, cartographic feel. It should be checked for resemblance to a map icon rather than a real Leeds ward.
4. **Marked ledger — elections A:** A single election record combines a marked selection and horizontal result bars. It replaces the earlier ballot-above-bars arrangement and aims to read as “recorded election evidence”, not a ballot box.
5. **Tally to chart — elections B:** Tally strokes and chart columns share the same geometry. This is more abstract and less dependent on a paper-ballot metaphor, while still signalling counting and analysis.

These are exploratory vector drafts, not production logos. The preferred symbol should be recognisable at 24–32 pixels and in monochrome, with no reliance on fine detail or colour alone. The tests to make next are a favicon, a header lockup, a dark-background inversion and a screen-reader-friendly text alternative.
