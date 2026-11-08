# Lingmu HUD V5 — one-to-one handpaint protocol (TEXT ONLY)

Do not render this document as an image or include a production queue/dashboard as a visual reference.

## Required per-asset information
1. SOURCE: a single tightly cropped authentic target icon from the original screen; record screen filename, source dimensions and bbox. No full screenshot, multi-icon sprite sheet or unrelated contexts.
2. IDENTITY: what ONE shape is. Use literal visible words; do not generalize a mascot into a party of people.
3. GEOMETRY: silhouette, count of components and markings, positions, orientation, line width, aspect ratio, and transparent negative spaces.
4. PALETTE: approximate original fill/edge/shadow/highlight RGB or hex plus opacity, but never interpret background colors as icon paint.
5. FORBIDDEN: explicit list of all ornamental additions, backing cards, extra parts, key labels and thematic redesigns.
6. OUTPUT: only ONE 512x512 transparent RGBA PNG, original anchor and padding, text/key hints separate. Absolutely no collage, atlas, infographic or dashboard.

## Generation prompt supplied with ONLY the target crop
Repaint exactly the single icon in this crop. Preserve its literal silhouette, part counts and positions, thickness, palette and semi-transparent edges; do not beautify or add any unseen elements. Output one isolated transparent game HUD sprite and nothing else. Follow the attached exact geometry/color/forbidden brief. Do not write words.

## QA and status
- Verify identity and outline against original screenshot crop; any wrong object fails.
- Compare at actual on-screen pixel size and 4x enlarged size, including alpha on original background.
- Output cropped source, candidate, review comparison, checksum and truthful state before any GitHub promotion.
- SVG-to-PNG or pixel-based shape-locked reference sprites are NOT new GPT Image handpainted artworks.
- After two unrelated generations, keep an unapproved retry record and advance to next task rather than looping or falsely claiming completion.