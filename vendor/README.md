# Vendored libraries

Isolated Web Apps can only load scripts from their own bundle, so these are
copied in unmodified.

| Library | Version | Source | License |
| --- | --- | --- | --- |
| chrome-tabs | 5.4.0 (commit 1046a3f) | https://github.com/adamschwartz/chrome-tabs | MIT (`chrome-tabs/LICENSE.txt`) |
| Draggabilly | 2.2.0 | https://github.com/desandro/draggabilly | MIT (header in `draggabilly/draggabilly.pkgd.min.js`) |

chrome-tabs assigns to `innerHTML`, which the IWA's Trusted Types policy blocks
by default. `js/trusted-types.js` allows exactly the markup chrome-tabs
generates and nothing else.
