# Production identity / 02

Source direction: [enterprise-direction.md](../enterprise-direction.md),
[identity-concept-v2.png](../identity-concept-v2.png), and
[landing-page-concept-v2.png](../landing-page-concept-v2.png). Original concepts
are superseded.

Assets are in [`public/brand`](../../../public/brand). Open
`/brand/preview.html` on the local app to see every variant at actual CSS pixel
sizes, including the 16px favicon. The preview PNG is captured at device scale 1.

## Files and usage

| Asset                                             | Use                                                     |
| ------------------------------------------------- | ------------------------------------------------------- |
| `symbol-dark.svg`, `symbol-white.svg`             | Standalone two-plane alignment symbol                   |
| `wordmark-dark.svg`, `wordmark-white.svg`         | Single-line outlined Inter Medium lettering             |
| `logo-dark.svg`, `logo-white.svg`                 | Combined symbol and wordmark, fixed optical spacing     |
| `favicon.svg`, `favicon-{16,32,48}.png`           | Transparent favicon; PNG sizes rasterized independently |
| `src/app/favicon.ico`                             | Multi-resolution 16/32/48px compatibility favicon       |
| `app-icon.svg`, `app-icon-{180,192,512,1024}.png` | Opaque square icon; the platform applies its own mask   |
| `brand-kit-preview.png`                           | Usage-size board                                        |
| `landing-desktop.png`, `landing-mobile.png`       | Browser captures of the implemented page                |

SVGs contain paths only, with no font, raster-image, filter, or external resource
dependencies. Lettering uses Inter Medium's native advances and kerning. Preserve
aspect ratios; do not stretch, rotate, recolor individual planes, or alter the
seam. The silhouette follows the v2 raster reference with gently softened corners,
a rear plane interrupted at the central seam, and an offset front plane.

Use the combined logo at 24–26px high in headers and 20px in footers. Use the
standalone symbol below that. Keep clear space of at least one-quarter symbol
height. White variants need a dark surface; dark variants need a light surface.
The app icon has generous internal padding and no baked-in platform corner mask.

Palette: ink `#16181B`, white `#FFFFFF`, cool surface `#F6F7F8`, secondary
`#6B7078`, accent `#087F79`. The landing page uses `#646A73` for small secondary
text and the existing teal semantic primary/ring tokens for controls. Workspace
and dashboard theme tokens are unchanged. Latin and punctuation WOFF2 subsets of Inter and their license are
in `public/fonts`; the landing page scopes its font to avoid changing dashboard
typography.

## Product fidelity

Visitors see the landing page at `/`; signed-in users retain their dashboard at
that URL. Primary actions use the existing `/login` route. The workspace and
decision-library images are captures of the authenticated app, backed by seeded
local database records. Desktop and mobile captures use separate responsive
views. Light-mode views are rendered from the authenticated app DOM at 2× pixel
density. Lossless PNG masters are in `app-screenshots`; lossless WebP assets are in
`public/product`. See [presentation-data.md](presentation-data.md) to reproduce
the three projects, seven plans, and team discussion.

The review panel uses real HTML text and components to present the intended
GitHub review workflow. It identifies plan version v1, PR commit `8f3c2a1`, and
code location `src/search.ts:12`.

See [verification.md](verification.md) for checks and browser evidence. No deploy
was performed.
