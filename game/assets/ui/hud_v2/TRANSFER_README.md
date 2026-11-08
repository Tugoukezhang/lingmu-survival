# HUD V2 archive transfer

This directory contains a lossless transfer of the original `hud_v2_complete_ascii.zip` (3,578,465 bytes; 28 transparent icon PNGs, 12 text PNGs, engineering layout/config and previews). Until the one-piece ZIP is present, run `python game/assets/ui/hud_v2/assemble_hud_v2.py` at the repository root. The script verifies SHA-256 and ZIP integrity.

The intended interface workflow is one hand-painted transparent PNG per HUD element. Keep the existing asset IDs, dimensions, alpha canvas/insets, pivot/anchor and nine-slice parameters; swap files without changing game code. This transfer does not use any user-supplied personal access token.
