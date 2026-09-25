# Core Web Vitals & Performance Checklist

## LCP
- Optimize hero media
- Preload only critical assets
- Use responsive images
- Compress images/video
- Avoid blocking font loads
- Server-render primary content

## INP
- Reduce heavy client-side JavaScript
- Avoid unnecessary animation listeners
- Defer non-critical scripts
- Keep interactions lightweight
- Break long tasks

## CLS
- Set image/video dimensions
- Reserve space for dynamic content
- Avoid late-loading banners that shift layout
- Stabilize fonts and navigation

## General
- CDN caching
- Brotli/Gzip
- HTTP/2 or HTTP/3 where supported
- Lazy-load below-the-fold media
- Modern image formats
- Minimize third-party tags
- Audit mobile first

## SEO rule
Performance improvements must not hide critical text from crawlers or break multilingual rendering.
