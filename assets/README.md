# 배너 이미지

- 도구: 내장 image_gen (imagegen 스킬), 첨부 레퍼런스를 바탕으로 제작
- 최종 배포 파일: assets/coffee-banner.jpg (2170 x 725, JPEG 품질 90, 약 127 KiB)
- 생성 PNG 원본은 Codex generated_images 폴더에 보존했습니다.
- 배너 문구·로고·수량·금액은 이미지에 포함하지 않고 HTML/SVG로 표시합니다.

## 최종 생성 프롬프트

Use case: compositing. Edit the supplied OrderPick UI reference into a production website hero BACKGROUND PHOTO asset only. Output a wide landscape image about 3:1. Keep the reference's premium photoreal overhead white ceramic cup of dark coffee with golden crema, realistic green coffee leaves and a few coffee beans, positioned only in the rightmost 40 percent, on a deep emerald green tabletop (#15543f to #246b55). Natural diagonal morning sunlight and soft leaf shadows from upper right. Leftmost 55 percent must be almost empty dark green, smooth and visually quiet, so live HTML white typography can be overlaid. Fill every pixel edge-to-edge with the green scene; square image corners. Remove the entire cream-colored page header, logo, all text, all numerals, dividers, icons, UI controls, outlines and rounded card frame. Do not render any letters, numbers, captions, logos or UI. Preserve the elegant coffee and botanical styling of the reference. Cup fully visible with some margin on the right, handle toward upper right; leaves near lower right and upper right, no flowers, no other objects. This is the final actual background asset, not a screenshot or mockup.

## Red banner variant (2026-10-29)

- App asset: `assets/coffee-banner-red.jpg` (134,679 bytes). Green original `coffee-banner.jpg` is preserved.
- Mode: built-in `image_gen`, edit with the existing banner as target. PNG original remains in Codex generated_images; JPEG quality 90 is used for the app.
- Official CI reference for the red direction: https://pr.seegenemedical.com/foundation/ci/index.do . App colour shades are design choices, not asserted official hex specifications.
- Final prompt:

```text
Edit target: the supplied wide OrderPick coffee website banner photograph. precise-object-edit. Preserve the exact existing wide composition, coffee cup on far right, empty left two thirds for HTML text, green leaves and coffee beans, natural diagonal daylight and realistic shadows. Change ONLY the emerald green tabletop/background to a rich dark Seegene-inspired crimson/burgundy red (approximately #981b35, deeper #651329 on left), elegantly subdued, no pink cast. Preserve the cup as natural clean white ceramic, the coffee as dark brown with golden crema, the leaves as realistic green, and beans as brown; do not recolor these objects. No text, no logo, no additional objects, no border. Wide aspect about 3:1. Photo-realistic polished website hero asset.
```
