# HUD-08 | main_bottom_Q — camera button (review brief, not an approved sprite)

## Source and exact scope
- Source: original `/Lingmu_HUD_Exports/Original_References/05_gameplay_hud.jpg`, 1920 × 1080 px.
- One component only: the **bottom-right Q camera button**, the leftmost of the three bottom-right action buttons.
- Approximate camera-button crop bbox [1420, 910, 1545, 1020] in native source coordinates; **inspect and tighten crop before generation**. Exclude the Q keyboard label directly underneath; exclude nearby E and F buttons and the garden scene.
- Candidate: `PNG_Transparent/00_gameplay/bottom_Q.png`; one transparent RGBA PNG, square canvas 512 × 512, camera/button centered; design at final native display size as well as 4× zoom.

## Visual identity and structure
- Compact, round, semi-transparent smoky grey/grey-brown glass-like bezel with faint darker edge. This circle is part of the original Q action button, not an invented backing plaque.
- Centered chubby, friendly camera silhouette in pale ivory/cream, with gentle warm grey shading and a subdued blue-grey top protruding viewfinder/shutter shape.
- One large centered dark circular lens: concentric dark cocoa ring, warm pale ring and dark center, with small painterly glints.
- Small colored details near the camera top/right. One small golden-yellow, five-point rounded star charm overlaps the camera body's lower-right edge.
- Soft cel-painterly shading and crisp but not oversharpened outlines. Tasteful natural enhancements are welcome; preserve readable camera identity at tiny UI size.
- Keep a clean transparent exterior and no scene background. Do not reproduce the green leaves, flowers, grass, keyboard Q text, or adjacent E/F controls from the screenshot.

## User's 2026-11-08 acceptance direction
The last two-person-avatar outcome was praised; the goal is **as good in artistic quality**, not 100% pixel-for-pixel reproduction. Allow more refined linework, soft material and shading, small deviations in outline/placement. Reject only if the Q icon ceases to read as this cream camera with brown lens, blue-grey top and small golden star, or if the UI sprite is dirty, overcrowded or stylistically divergent.

## Execution note
Source screenshot visible in Library and internally verified; no authentic **single-item crop bytes** have been attached to the image-generation interface in this turn. **Do not claim a newly generated/approved Q PNG until that crop and generation really happen.**
