# ADR 007: Product photos

Status: **accepted** (3 Nov 2026, Phase 2). Developer chose the recommended options. Verified live on staging.

## Decision

- **Originals in R2, resized on demand.** Photos are stored once in R2 (`products/<product id>/<image id>.<ext>`). `GET /media/<key>?w=640` returns a resized copy made by the **Cloudflare Images binding** (`IMAGES`) in the API Worker. Nothing is pre-generated, so there is no processing at upload time and no CPU cost on the Workers Free limit.
  - Verified on staging (workers.dev, no custom domain needed): a 140 KB PNG became 27 KB (PNG), 12.9 KB (WebP) and 12.2 KB (AVIF) at 640 px, and 4.9 KB (WebP) at 320 px.
  - Offered widths are 320, 640, 960, 1280 and 1920. Any other `w` snaps up to the next one, so callers cannot create endless unique transformations. Cloudflare bills per unique transformation: free for the first 5,000 a month, then USD 0.50 per 1,000. A small shop stays far below that.
  - The format follows the browser's `Accept` header (AVIF, then WebP, then the original JPEG or PNG), with `Vary: Accept`.
  - If resizing fails, or the binding is missing (local tests), the original is served instead of a broken image.
- **Uploads are a plain HTTP route**, `POST /media/upload?productId=...&alt=...`, with the photo as the body and a Bearer token. Everything else (list, alt text, primary, order, delete) is tRPC under `images.*`.
- **The server never trusts the browser or the file name.** The type comes from the bytes (JPEG, PNG or WebP only, so SVG and HTML are refused). Limits: 12 MB per photo, 100 megapixels, 12 photos per piece.
- **Metadata is stripped on the server** (`src/media/image.ts`, covered by tests): JPEG loses Exif (including GPS), XMP, IPTC and comments, PNG loses text and Exif chunks, WebP loses EXIF and XMP. JPEG keeps one thing, the orientation tag, in a minimal Exif block, so a phone photo taken sideways still displays upright. Reported width and height are the upright size. The ICC colour profile is kept.
- **Photo URLs are unguessable, not access-controlled.** A photo is served to anyone who knows its key (two ULIDs), whatever the piece's status. Keys are only ever returned to signed-in staff, or on the public page of a piece that is visible. This avoids a database lookup per image and allows year-long immutable caching. A draft's photo is therefore reachable by someone who was given the exact link, which is acceptable for handmade-art photos.
- The first photo of a piece is its primary image, and deleting the primary promotes the next one. A product with no photos is hidden from the public site unless the owner turns that on (IMG-8), and appears in the "Needs photos" queue (`products.list` with `hasPhoto: false`, plus a count in `inventory.summary`).

## Done in the browser (admin web app, still to build)

- Convert HEIC to JPEG before upload (only if the file is HEIC, loading the converter on demand), downscale large photos, and apply rotation. The server only accepts JPEG, PNG and WebP.

## Consequences

- Alt text defaults to the piece's title when none is given (IMG-5) and is editable. It is not updated when the title changes later.
- Moving to a custom domain later only changes the base URL clients use for `/media/...`.
- Deleting a photo deletes its file. A backup of the R2 bucket is a Phase 8 task.
