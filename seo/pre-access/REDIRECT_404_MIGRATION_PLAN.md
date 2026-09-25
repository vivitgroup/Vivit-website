# Redirect, 404 & Migration Plan

## 301
Use 301 for old URLs that have a clear replacement.

## 404
Return a real 404 for URLs that never existed or have no replacement.

## 410
Use selectively for intentionally removed content with no replacement when appropriate.

## Migration map columns
Old URL
New URL
Reason
Status code
Internal links updated?
Sitemap removed?
Canonical verified?

## Rules
Never redirect every missing URL to the homepage.
Avoid redirect chains.
Update internal links to final destinations.
Remove redirected URLs from XML sitemaps.
