# Content Gateway Performance and Correctness Report

Date measured: 2026-08-23
Branch: `feat/ui-performance-design`

## Outcome

The public `content:*` IPC surface now routes through one validation gateway. The gateway uses the direct HTTP/Cheerio provider only where real-site parity was demonstrated, falls back to the existing BrowserWindow extractor elsewhere, coalesces identical in-flight work, and persists only validated public results.

No reader descrambling code changed. The original page array order and `scrambleId` cross the gateway without sorting, deduplication, or index reconstruction.

## Real-site provider samples

Each endpoint was sampled ten times with the gateway, scraper, image, and persistent caches cleared between samples inside an isolated portable data directory under `work/`. No credentials, favorites, URLs, or user database rows were recorded in the report.

| Endpoint | Direct | Browser fallback | p50 | p95 | Max | Validation failures | Route decision |
|---|---:|---:|---:|---:|---:|---:|---|
| Homepage (three categories) | 0 | 10 | 3822.21 ms | 5075.69 ms | 5075.69 ms | 0 | Browser: direct section splitting is heuristic |
| JM1215915 detail | 0 | 10 | 2578.65 ms | 3173.84 ms | 3173.84 ms | 0 | Browser: direct result omitted canonical author/tags |
| Search `男人配额制` | 10 | 0 | 902.90 ms | 1289.20 ms | 1289.20 ms | 0 | Direct parity accepted for the default filter set |
| JM1215915 pages | 10 | 0 | 710.45 ms | 1010.00 ms | 1010.00 ms | 0 | Direct page order and scramble metadata accepted |

Homepage and detail timings use the main-process `scraper.navigate` span, which covers BrowserWindow navigation and its configured render wait. Search and pages timings cover renderer-to-main IPC round trips. The two timing bases should not be treated as a microbenchmark comparison, but they represent the user-visible provider paths closely enough to show where BrowserWindow dominates latency.

Fallback reason for all homepage and detail samples was `direct-error`, intentionally produced by the provider gate for unverified direct semantics. There were no validator-triggered fallbacks in these 40 samples.

## Correctness gate

- JM1215915 BrowserWindow detail returned author `MALPOI, 達蘭`, exactly five canonical tags, an empty description, and 58 chapters. The direct detail returned `未知作者`, no tags, and 116 duplicate/noisy chapter entries, so direct detail remains disabled.
- The tested chapter contained 71 pages with `scrambleId=220980`. Direct and BrowserWindow results matched for count, scramble ID, and the complete ordered `[index, imageUrl]` sequence in the same comparison session.
- Across all ten final page samples, indices remained 0–70 and filenames remained `00001.webp` through `00071.webp`. CDN host assignment can change between sessions, but the source filename sequence does not.
- The image correctness contracts still pin the reader MD5 input, strip-count thresholds, strip drawing order, downloader descrambling, `page_arr` source order, and concurrent write-back index.

## Cache and startup samples

The persistent cache uses a 10-minute fresh window and a 24-hour stale-readable window. Stale data returns immediately and triggers one background refresh; expired data blocks for a validated provider result. Writes use a temporary file followed by rename, and the existing “clear all caches” action invalidates gateway memory plus the persistent file.

| Scenario | Samples | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Electron cold start to renderer ready | 10 | 814.04 ms | 1326.03 ms | 1326.03 ms |
| Same 71-page chapter, in-process warm navigation | 10 | 0.40 ms | 3.60 ms | 3.60 ms |

The chapter's first uncached direct request took 754.10 ms. After a process restart, the same validated result restored from disk in 0.80 ms while preserving 71 pages and `scrambleId=220980`.

## Technical decisions

- Local custom-scheme responses continue to use Electron's asynchronous [`protocol.handle`](https://www.electronjs.org/docs/latest/api/protocol/) path and Node's promise-based filesystem APIs documented under [`fs/promises`](https://nodejs.org/api/fs.html).
- The content cache is a small versioned atomic JSON snapshot rather than another database migration. The project already uses [`sql.js`](https://github.com/sql-js/sql.js/), whose normal persistence flow exports the in-memory database; changing that mature database path was unnecessary for public, replaceable cache data.
- Cache keys include the endpoint and normalized request parameters. Cookies, credentials, favorites, and other auth-sensitive data never enter this cache.

## Verification

- All 21 main-process test files passed after implementation.
- `npm run build` completed successfully for main, preload, and renderer bundles.
- `npx tsc --noEmit` reported no errors in content cache, gateway, or content API files; unrelated pre-existing type errors remain elsewhere in the repository.
