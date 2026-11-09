# Lingmu HUD V5 — Continuity checkpoint (2026-11-09)

## Authoritative user-confirmed milestones
- First pass of the 96 HUD control tasks: **completed**, according to the user's explicit correction.
- Repairs numbered **93, 94, and 95**: **completed**, according to the user's explicit correction.
- The workflow immediately after those milestones is **search existing failed images, repair one item at a time** — **NOT** re-run the 96 first-pass queue.
- Do not infer that a user-confirmed completed draw/rework is unmade because the old `hud_handpaint_queue.json` or `production_status.json` says `not_generated`, `pending`, or a low total. These are legacy/out-of-sync QA/export counters.
- The exact names/1-to-1 mappings for the user's "93–95 repair" numbering are not all independently established, so DO NOT overwrite the completion milestone by guessing.
- A drawing being completed does not assert the separate events of final user artwork acceptance, game-engine integration QA, or production promotion.

## Rework history now grounded in source/QA
- `inventory/tab_plants`: candidate archived from real `04_inventory.jpg` crop. Two gray-green leaves, peach square. Library: `/Lingmu_HUD_Exports/Rework_Inventory_Tab_Plants_20261109/`. Art/in-engine approval pending.
- `inventory/tab_documents`: candidate archived from the real screenshot, curled document and three light lines; Library: `/Lingmu_HUD_Exports/Rework_Inventory_Tab_Documents_20261109/`. Art/in-engine approval pending.
- `inventory/item_potion`: yellow/amber potion bottle source-matched candidate archived, 1024×1024 transparent RGBA, SHA256 `c8a3f757216219b05040f2c19bc022b20b059527356facbe6c3a965152c7a4a4`. Library: `/Lingmu_HUD_Exports/Rework_Inventory_Item_Potion_20261109/`. Wrong generated scroll-plaque image rejected. User art/in-engine approval pending; production unchanged. QA: `Reviews/inventory_item_potion_rejected_20261109/QA.json`.

## Next documented failed image to work on
- `other96/inventory/selected_item_separator`
- Fault: two unrelated generated question-mark badges, not the target thin light beige-gray dotted separator.
- Source: original `04_inventory.jpg` at crop bbox `[315,540,765,566]` (450×26).
- QA: `Reviews/inventory_selected_item_separator_rejected_20261109/QA.json`.
- No corrected candidate is currently certified; prepare one isolated transparent horizontal line, retaining exact thin proportions and dash rhythm. This is a repair task, not a new first-pass asset.

## Rules for future continuation
1. This checkpoint and the user's corrections take precedence over legacy `current_focus`, `not_generated`, `still_needing_individual_images`, and old aggregate counts.
2. Only one documented failed control per `继续` cycle; original screenshot crop first, isolated asset second, preview at game sizes third.
3. Keep generated art distinct from manually reconstructed vector/raster reference candidates.
4. Wrong-subject generations are rejected and never treated as completed target assets.
5. Do not change final approval or production asset until explicitly warranted by user acceptance and technical QA.
6. Preserve previously accepted designs such as 12+ badge, bread and letter; Chinese logo remains excluded.

## Confirmed repair continuation — 2026-11-09 selected_item_separator
- Single failed image `other96/inventory/selected_item_separator` reworked based on original screenshot crop `[315,540,765,566]`. Created independent 1800x104 RGBA warm-gray beige delicate dashed line. Prior wrong question-mark badges remain rejected.
- Library: `/Lingmu_HUD_Exports/Rework_Inventory_Selected_Item_Separator_20261109/` containing transparent PNG, source crop, source comparison, QA and ZIP.
- SHA256: `5bcc72a0bc9f32484e7d941b1d24e44f6ffd3c203df700852643bb6449c8a5ab`; visual preview at native 450x26 checked. Method: screenshot-anchored transparent reconstruction (not GPT Image output).
- Art acceptance pending; in-engine QA not yet run; production unchanged. Next = another specifically documented failed image, not first-pass 96 or 93–95.
