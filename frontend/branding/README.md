# Branding

Icon candidates for the redesign (JAV-122). Hand-crafted SVG sources, not
generated. Open `preview.html` from disk to compare them at every size and
under launcher masks.

This folder is outside `public/` on purpose: the service-worker precache glob
includes `**/*.html`, so a preview page in `public/` would ship to users.

After one mark is approved, the live set in `public/` is regenerated from it:
export `transparent.png` (mark only, no background) and `maskable.png`
(full-bleed) at 1024x1024, then run `pnpm generate-pwa-assets`. `favicon.svg`
and `monochrome.svg` are replaced by hand from the chosen source.
