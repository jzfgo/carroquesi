# ADR-015: Receipt images in Google Cloud Storage via backend-issued signed URLs

**Status:** Accepted, allowed types amended 2026-08-02
**Date:** 2026-08-02

## Context

Nothing is stored today: the receipt image goes from the camera to Gemini and
is discarded once the parse lands in `receipt_scans`. The redesign's receipt
features need the originals — showing the receipt alongside a trip, re-checking
a disputed price against the photo, re-parsing with a better prompt.

Images are binary blobs. Postgres holds all application data (ADR-002) but is
a poor home for photos: they bloat backups, inflate row sizes, and buy none of
the relational machinery that justified Postgres in the first place. The
natural store is Google Cloud Storage — the project's Firebase default bucket
(`carroquesi.firebasestorage.app`) already exists, and the deploy workflow
already passes `RECEIPT_STORAGE_BUCKET` into Cloud Run from an earlier
experiment that stored uploads server-side.

Two honest ways to let the app read and write that bucket:

| Approach | Notes |
|---|---|
| **Firebase Storage client SDK + security rules** | Client talks to the bucket directly; authorization re-implemented in `storage.rules`, which cannot see Postgres |
| **Backend-mediated signed URLs** | Bucket stays private; the backend checks membership (and, later, consent) in Postgres and mints short-lived V4 signed URLs |

## Decision

**Backend-mediated V4 signed URLs.** The bucket stays private, `storage.rules`
stays fully locked (`allow read: if false; allow write: if false`), and the
Firebase client SDK is never used for Storage. The backend enforces list
membership — and the consent model when it lands — before minting any URL.

- **Uploads are a signed PUT direct to GCS.** The backend mints a short-lived
  PUT URL and the client sends the bytes straight to the bucket; the image
  never transits Cloud Run. The upload endpoint (JAV-133) is deliberately
  constrained to this shape.
- **Object layout:** `receipts/{list_id}/{scan_id}.<ext>`. Keyed by list, not
  by user, so access and retention follow the list the receipt belongs to.
- **Limits:** 10 MB per file; `image/jpeg`, `image/png`, `image/webp`, or
  `application/pdf`. Both are enforced inside the signature — the signed URL
  binds the exact `Content-Type` and an `X-Goog-Content-Length-Range`
  condition — so GCS itself rejects an upload that exceeds them, even though
  the bytes never pass through the backend. *(Amended 2026-08-02:
  `application/pdf` joined the original image-only list — supermarket apps
  export multi-page receipts as PDF, and a page count carried as scan
  metadata covers the multi-page display need. Same 10 MB cap; a PDF receipt
  is no heavier than a photo.)*
- **Retention: list-lifetime, no age cap.** Receipts live as long as their
  list. Deleting a list deletes its `receipts/{list_id}/` prefix, best
  effort. **Recorded obligation:** when an account-deletion endpoint exists,
  it must also delete the receipt objects of every list it removes.
- **Config:** `RECEIPT_STORAGE_BUCKET` (the env var already in the deploy
  workflow). Empty means storage is disabled and the app behaves as today.

## Rationale

**Authorization truth lives in Postgres.** Who may see a receipt is a question
about `list_members` (and later about consent rows). Security rules cannot
join Postgres, so the client-SDK approach would re-encode membership in a
second language that drifts from the real one. Keeping the rules at `false`
leaves exactly one authorization system.

**A locked bucket removes a whole bug class.** No rules expression can be
subtly wrong if every rule is `false`. The only paths to an object are
backend-minted URLs that expire in minutes.

**The existing service-account key signs V4 URLs locally.** Cloud Run already
mounts the Firebase Admin SDK key file at `/secrets/firebase-credentials`;
that JSON contains a private key, so signing needs no extra credential and no
IAM round-trip.

**Signed PUT keeps large bodies out of Cloud Run.** Proxying 10 MB uploads
through the backend would hold request slots for the slowest mobile
connection in the household. The signature's content-type and length
conditions preserve the limits the backend would otherwise have enforced by
inspecting the body.

**Reusing the Firebase default bucket adds no new infrastructure.** The
bucket exists, the env plumbing exists, and a second bucket would be one more
knob with no behavior attached.

## Consequences

- **Gained:** originals are kept, gated by Postgres-backed authorization,
  with no Firebase Storage SDK in the client bundle and no GCP dependency in
  the test suite (the GCS client is mocked).
- **Accepted:** the backend must hold a service-account key file. V4 signing
  reads the private key locally, so this decision leans on the key staying a
  mounted file.
- **Accepted:** orphan objects are possible — an upload whose scan row never
  commits, or a scan row deleted without its file. A reconciliation sweep
  could compare the prefix against `receipt_scans`, but at this volume an
  orphan costs a fraction of a cent and the list-delete purge bounds its
  lifetime; the sweep is complexity not yet earned.
- **Watch:** a move to keyless workload identity (no mounted key) breaks
  local signing. The escape hatch is IAM-based signing (`signBlob` via
  `roles/iam.serviceAccountTokenCreator`), which the client library supports
  but which adds an IAM call per URL.
- **Watch:** URL expiry vs. slow uploads. The PUT expiry must comfortably
  cover a multi-megabyte photo on a bad mobile connection; if uploads start
  failing at the margin, widen the expiry rather than retrying blind.

## Cost

Rough math: a household scans on the order of 10 receipts a month at ~2 MB
each — about 0.25 GB per list per year. Standard EU regional storage is
~$0.023/GB/month, so even a hundred active lists a year in costs well under
$1/month; operations (Class A writes, Class B reads) at these request counts
are fractions of a cent. With no age cap, cost grows linearly with retained
history — revisit only if the math above stops being pennies.

## Bucket setup (manual, one-time)

Consistent with the repo's no-Terraform stance, these are documented `gcloud`
steps, not automation. The service account is the one whose key is mounted at
`/secrets/firebase-credentials` — its address is the `client_email` field in
that JSON.

```bash
# Enforce uniform bucket-level access (disables per-object ACLs)
gcloud storage buckets update gs://carroquesi.firebasestorage.app \
  --uniform-bucket-level-access

# Enforce public access prevention (no object can ever be made public)
gcloud storage buckets update gs://carroquesi.firebasestorage.app \
  --public-access-prevention

# Grant the backend service account object admin on this bucket only
gcloud storage buckets add-iam-policy-binding gs://carroquesi.firebasestorage.app \
  --member="serviceAccount:<client_email from the mounted key JSON>" \
  --role="roles/storage.objectAdmin"

# Verify
gcloud storage buckets describe gs://carroquesi.firebasestorage.app \
  --format="value(uniform_bucket_level_access,public_access_prevention)"
```

### CORS (required since the 25b viewer / upload wiring)

The browser talks to the bucket directly in two ways that trigger CORS:

- the signed **PUT** carries `x-goog-content-length-range`, a non-safelisted
  header, so the browser preflights it;
- the PDF viewer fetches the signed **GET** URL with `fetch` (pdf.js), which
  needs a CORS response header to read the bytes.

Plain `<img>` thumbnails need nothing — image elements are CORS-exempt —
which is exactly why a missing policy is easy to miss: thumbnails work while
uploads and PDF viewing fail. Apply the policy once:

```bash
# cors.json:
# [
#   {
#     "origin": [
#       "https://carroquesi.web.app",
#       "http://localhost:5173",
#       "http://localhost:5174",
#       "http://localhost:4173"
#     ],
#     "method": ["GET", "PUT"],
#     "responseHeader": ["Content-Type", "x-goog-content-length-range"],
#     "maxAgeSeconds": 3600
#   }
# ]
gcloud storage buckets update gs://carroquesi.firebasestorage.app \
  --cors-file=cors.json

# Verify
gcloud storage buckets describe gs://carroquesi.firebasestorage.app \
  --format="json(cors_config)"
```
