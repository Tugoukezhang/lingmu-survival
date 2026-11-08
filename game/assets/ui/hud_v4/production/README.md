# HUD V4 — Individual RGBA assets

Contains **97 separate transparent PNG sprites**, grouped by title, activity, inventory, home decoration, map and shared UI, plus layout references, localized text metadata and asset hashes.

### Fidelity boundary
These are high-resolution **raster-finished reconstructions of the existing SVG assets**, not pixel-perfect extraction from the reference screenshots, nor 97 separately generated GPT Image artworks. The source artwork's geometry, canvas, and alpha are preserved to minimize unexpected redesigns. Validate manually against reference at actual displayed size before finalizing a release.

Keep existing V3 asset IDs and resource paths where possible; to use V4 replace the asset root once, or copy matching PNG filenames in place. If runtime still references .svg, a one-time path update is required. Dynamic text stays outside images.
