# PDF format media QA - 1.1.0

Verified on 2026-09-29 using the current `src/main/pdfWriter.ts` export `writePdfPart`. No product code was changed by this QA. Three source fixtures and the repeatable generation/verification scripts are in `work/110-pdf-formats-qa/`.

**Result: all three tested formats passed.** The entire PDF was rendered with Poppler at 96 DPI. Each of its three pages was opened and visually inspected independently; metadata and image payload checks also passed.

| Page | Input image | PDF page points | Rendered pixels | Observed result |
| --- | --- | --- | --- | --- |
| 1 | RGB JPEG, encoded 1200 x 600 | 900 x 450 | 1200 x 600 | Landscape remains landscape; A/B/C/D corner markers, full dark border, TOP/BOTTOM labels and upward arrow are complete and correctly placed. No clipping or stretch observed. |
| 2 | RGBA PNG, 800 x 1000 | 600 x 750 | 800 x 1000 | Fully transparent areas render white. Opaque and 50% alpha red/green/blue rectangles composite correctly; labels and the complete border remain visible. No black rectangle, unexpected blank area, or clipping observed. |
| 3 | RGB JPEG, encoded 900 x 600, EXIF orientation 6 | 450 x 675 | 600 x 900 | Upright portrait after the expected 90-degree clockwise correction. A/B are at top, C/D at bottom; arrow and text point/read upright. No double rotation, incorrect aspect ratio, or clipping observed. |

All page CropBoxes equal their MediaBoxes. Page `/Rotate` is 0 for all three; the orientation correction is applied by the page content transform. The three bookmarks appear in source order and target pages 1, 2 and 3, respectively.

Payload checks prove that both JPEG streams preserve the exact original input bytes, and the PNG's decoded RGB data plus soft-mask alpha data preserve every source channel value. A total of 31 flat-region, arrow/corner and full-border pixel probes match the expected RGB values exactly at 96 DPI. For the transparent PNG, the fully transparent probes are `(255,255,255)` and the 50% alpha rectangle centers are `(237,147,147)`, `(147,217,162)` and `(147,170,237)`, matching Pillow compositing over white.

The whole rendered PNGs are not byte-identical to the expected input rasters because Poppler samples image/text edges. Mean absolute per-channel render differences are recorded in the machine report; visual inspection and exact flat-region probes show no semantic discrepancy. No claim of globally identical rendered pixels is made.

Artifacts:

- `three-format-sample.pdf`, 161,996 bytes, SHA-256 `0d1e0b9d702f58f4ecc319f0eab05131215c26b1e3beb8795748371cc3554e01`.
- `format-page-1.png`, `format-page-2.png`, `format-page-3.png`: Poppler renders actually inspected.
- `three-format-verification.json`: page sizes, outlines, page content transforms, payload checks, all pixel probes and observed writer SHA-256.
- Observed writer SHA-256: `3ace50df729ded3095d8c215fb8b9a2062f5538d0f979a48cb4c6de09d51b6a2`; its last modification was 2026-09-29 09:36:58 UTC, before this PDF was generated at 10:18:04 UTC.

Execution used installed Pillow, pypdf, tsx and Poppler. The initial sandboxed tsx invocation failed at `os.userInfo()` with `uv_os_get_passwd ENOMEM` before running the writer. The same local QA script then completed successfully after normal tool permission review; no package or runtime was installed or modified.

This verifies the current writer directly. It does not verify the network download manager, worker lifecycle, UI flow, WebP decoding, other EXIF orientations, unusually large-image memory behavior, real-world PDF viewers beyond Poppler, GPU performance, or general GPU compatibility.
