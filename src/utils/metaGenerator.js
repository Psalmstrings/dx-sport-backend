'use strict';

const path = require('path');
const fs = require('fs');

const SITE_URL = process.env.SITE_URL || 'https://dxsportz.com';
const SITE_NAME = 'DX SPORTS';
const TWITTER_HANDLE = '@DXSportsbr';
const DEFAULT_OG_IMAGE = process.env.DEFAULT_OG_IMAGE || `${SITE_URL}/og-default.png`;
const DEFAULT_OG_IMAGE_TYPE = 'image/png';

/**
 * Read the <script> and <link rel="stylesheet"> asset tags from the built
 * frontend index.html so we can embed the correct hashed filenames in our
 * server-rendered meta pages. Falls back to a glob search if the file is absent.
 */
let _cachedAssetTags = null;
function getAssetTags() {
  if (_cachedAssetTags) return _cachedAssetTags;
  try {
    const builtHtml = fs.readFileSync(
      path.join(__dirname, '../../public/index.html'),
      'utf8'
    );
    // Extract <script type="module" ... src="..."> tags
    const scriptMatches = [...builtHtml.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)];
    const linkMatches = [...builtHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];

    const scripts = scriptMatches.map(m => `  <script type="module" crossorigin src="${m[1]}"></script>`).join('\n');
    const links = linkMatches.map(m => `  <link rel="stylesheet" crossorigin href="${m[1]}" />`).join('\n');
    _cachedAssetTags = { scripts, links };
  } catch (e) {
    // Fallback for dev mode or if build hasn't run yet
    _cachedAssetTags = { scripts: '  <script type="module" src="/src/main.jsx"></script>', links: '' };
  }
  return _cachedAssetTags;
}

/**
 * Determine MIME type from image URL extension.
 */
function getMimeType(url) {
  if (!url) return DEFAULT_OG_IMAGE_TYPE;
  const ext = url.split('?')[0].split('.').pop().toLowerCase();
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    svg: 'image/svg+xml'
  };
  return map[ext] || 'image/jpeg';
}

/**
 * Ensure an image URL is absolute HTTPS.
 * If the stored URL is relative (e.g. /uploads/foo.jpg), prepend SITE_URL.
 * If it is a base64 data URI (from the local-fallback upload path), discard it and use the default.
 */
function toAbsoluteImageUrl(url) {
  if (!url || typeof url !== 'string') return DEFAULT_OG_IMAGE;
  if (url.startsWith('data:')) return DEFAULT_OG_IMAGE; // base64 data URIs are not publicly accessible
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${SITE_URL}${url}`;
  return `${SITE_URL}/${url}`;
}

/**
 * Safely escape a string for use inside an HTML attribute or JSON string.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Escape a string for embedding inside a JSON-LD <script> block.
 * Must not close the <script> tag.
 */
function escapeJsonLd(str) {
  if (!str) return '';
  return String(str)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * Strip HTML tags and return plain text excerpt.
 */
function toPlainText(html, maxLength = 160) {
  if (!html) return '';
  const text = html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength - 3) + '...' : text;
}

/**
 * Build the complete HTML page with all social sharing metadata injected.
 * The page includes a tiny inline script that notifies the React SPA which slug to open.
 *
 * @param {object|null} post  - Mongoose post document (or null for 404/default)
 * @param {string}      slug  - URL slug
 * @returns {string}          - Full HTML string
 */
function generateMetaHtml(post, slug) {
  const isArticle = !!post;

  // --- Canonical URL ---
  const canonicalUrl = isArticle
    ? `${SITE_URL}/news/${post.slug}`
    : `${SITE_URL}/`;

  // --- Title ---
  const pageTitle = isArticle
    ? `${escapeHtml(post.title)} | ${SITE_NAME}`
    : `${SITE_NAME} — Official Sports Portal`;

  // --- Description ---
  const rawDescription = isArticle
    ? (post.summary || toPlainText(post.content, 160))
    : 'DX Sports – Premium Nigerian football news portal. Live NPFL scores, Super Eagles updates, transfer gist, video highlights, and league standings.';
  const description = escapeHtml(rawDescription.slice(0, 300));

  // --- Image ---
  const rawImage = isArticle ? toAbsoluteImageUrl(post.coverImage || post.image || '') : DEFAULT_OG_IMAGE;
  const ogImage = rawImage;
  const ogImageType = getMimeType(rawImage);

  // --- Author ---
  const authorName = isArticle && post.author
    ? (post.author.name || SITE_NAME)
    : SITE_NAME;

  // --- Dates ---
  const publishedTime = isArticle && post.createdAt ? new Date(post.createdAt).toISOString() : '';
  const modifiedTime = isArticle && post.updatedAt ? new Date(post.updatedAt).toISOString() : '';

  // --- Category & Tags ---
  const category = isArticle ? (post.category || 'News') : '';
  const tags = isArticle && Array.isArray(post.tags) ? post.tags : [];
  const tagMetas = tags.map(t => `  <meta property="article:tag" content="${escapeHtml(t)}" />`).join('\n');

  // --- JSON-LD ---
  const imageForSchema = ogImage !== DEFAULT_OG_IMAGE ? ogImage : DEFAULT_OG_IMAGE;
  const jsonLd = isArticle
    ? {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: post.title,
        description: rawDescription.slice(0, 300),
        image: [imageForSchema],
        datePublished: publishedTime,
        dateModified: modifiedTime || publishedTime,
        author: {
          '@type': 'Person',
          name: authorName
        },
        publisher: {
          '@type': 'Organization',
          name: SITE_NAME,
          logo: {
            '@type': 'ImageObject',
            url: DEFAULT_OG_IMAGE
          }
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl
        }
      }
    : {
        '@context': 'https://schema.org',
        '@type': 'NewsMediaOrganization',
        name: SITE_NAME,
        url: SITE_URL,
        logo: DEFAULT_OG_IMAGE,
        sameAs: [
          'https://www.facebook.com/DXSportsbr/',
          'https://x.com/DXSportsbr',
          'https://www.youtube.com/channel/UCKTdgZGovXp1D2pdu-G7taQ'
        ]
      };

  const jsonLdString = escapeJsonLd(JSON.stringify(jsonLd, null, 2));

  // --- Slug for client-side auto-open ---
  const safeSlug = isArticle ? escapeHtml(post.slug) : '';

  const { scripts, links } = getAssetTags();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />

  <!-- Primary SEO -->
  <title>${pageTitle}</title>
  <meta name="title" content="${pageTitle}" />
  <meta name="description" content="${description}" />
  <meta name="robots" content="index, follow" />
  <meta name="author" content="${escapeHtml(authorName)}" />
  <meta name="theme-color" content="#000b3d" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Open Graph / Facebook / WhatsApp / LinkedIn / Messenger / Telegram / Discord / Slack / Teams / Threads -->
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${isArticle ? escapeHtml(post.title) : pageTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${isArticle ? escapeHtml(post.title) : SITE_NAME}" />
  <meta property="og:locale" content="en_US" />

  <!-- Article-specific Open Graph (only for article pages) -->
${isArticle ? `  <meta property="article:published_time" content="${publishedTime}" />
  <meta property="article:modified_time" content="${modifiedTime || publishedTime}" />
  <meta property="article:author" content="${escapeHtml(authorName)}" />
  <meta property="article:section" content="${escapeHtml(category)}" />
${tagMetas}` : ''}

  <!-- X / Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="${TWITTER_HANDLE}" />
  <meta name="twitter:creator" content="${TWITTER_HANDLE}" />
  <meta name="twitter:title" content="${isArticle ? escapeHtml(post.title) : pageTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:image:alt" content="${isArticle ? escapeHtml(post.title) : SITE_NAME}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="/og-default.png" />

  <!-- Schema.org JSON-LD Structured Data -->
  <script type="application/ld+json">
${jsonLdString}
  </script>

  <!-- Signal to the React SPA which article to open on load -->
  <script>
    window.__DX_INITIAL_SLUG__ = ${isArticle ? `"${safeSlug}"` : 'null'};
  </script>

  <!-- Google Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@500;600;700;800;900&display=swap" rel="stylesheet" />

  <!-- React SPA assets -->
${links}
</head>
<body>
  <div id="root"></div>
${scripts}
</body>
</html>`;
}

/**
 * Generate meta HTML for the homepage / generic pages.
 */
function generateDefaultMetaHtml() {
  return generateMetaHtml(null, null);
}

module.exports = { generateMetaHtml, generateDefaultMetaHtml };
