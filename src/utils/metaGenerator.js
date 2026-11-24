'use strict';

const path = require('path');
const fs = require('fs');

const DEFAULT_SITE_URL = process.env.SITE_URL || 'https://dxsportz.com';
const SITE_NAME = 'DX SPORTS';
const TWITTER_HANDLE = '@DXSportsbr';
const DEFAULT_OG_IMAGE = process.env.DEFAULT_OG_IMAGE || `${DEFAULT_SITE_URL}/og-default.png`;
const DEFAULT_OG_IMAGE_TYPE = 'image/png';

/**
 * Determine dynamic base URL based on incoming request if available.
 */
function getBaseUrl(req) {
  if (req) {
    const host = req.get('host');
    if (host) {
      const isSecure = req.secure || req.get('x-forwarded-proto') === 'https';
      const protocol = isSecure ? 'https' : (process.env.NODE_ENV === 'production' ? 'https' : (req.protocol || 'http'));
      return `${protocol}://${host}`;
    }
  }
  return DEFAULT_SITE_URL;
}

/**
 * Read the <script> and <link rel="stylesheet"> asset tags from the built
 * frontend index.html so we can embed the correct hashed filenames in our
 * server-rendered meta pages.
 */
let _cachedAssetTags = null;
function getAssetTags() {
  if (_cachedAssetTags) return _cachedAssetTags;
  try {
    const builtHtml = fs.readFileSync(
      path.join(__dirname, '../../public/index.html'),
      'utf8'
    );
    const scriptMatches = [...builtHtml.matchAll(/<script[^>]+src="([^"]+)"[^>]*><\/script>/g)];
    const linkMatches = [...builtHtml.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)];

    const scripts = scriptMatches.map(m => `  <script type="module" crossorigin src="${m[1]}"></script>`).join('\n');
    const links = linkMatches.map(m => `  <link rel="stylesheet" crossorigin href="${m[1]}" />`).join('\n');
    _cachedAssetTags = { scripts, links };
  } catch (e) {
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
 */
function toAbsoluteImageUrl(url, baseUrl = DEFAULT_SITE_URL) {
  if (!url || typeof url !== 'string') return DEFAULT_OG_IMAGE;
  if (url.startsWith('data:')) return DEFAULT_OG_IMAGE;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
}

/**
 * Safely escape a string for use inside an HTML attribute or text node.
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
 * Render standard HTML layout with meta tags.
 */
function renderHtmlShell({
  pageTitle,
  description,
  canonicalUrl,
  ogType = 'website',
  ogImage,
  ogImageType = 'image/png',
  author = SITE_NAME,
  jsonLd = null,
  initialRoute = null,
  extraMeta = ''
}) {
  const { scripts, links } = getAssetTags();
  const jsonLdBlock = jsonLd
    ? `  <script type="application/ld+json">\n${escapeJsonLd(JSON.stringify(jsonLd, null, 2))}\n  </script>`
    : '';

  const initialRouteScript = initialRoute
    ? `  <script>
    window.__DX_INITIAL_ROUTE__ = ${JSON.stringify(initialRoute)};
    window.__DX_INITIAL_SLUG__ = ${initialRoute.slug ? JSON.stringify(initialRoute.slug) : 'null'};
  </script>`
    : `  <script>window.__DX_INITIAL_ROUTE__ = null; window.__DX_INITIAL_SLUG__ = null;</script>`;

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
  <meta name="author" content="${escapeHtml(author)}" />
  <meta name="theme-color" content="#000b3d" />
  <link rel="canonical" href="${canonicalUrl}" />

  <!-- Microdata for WhatsApp / Telegram / iMessage -->
  <meta itemprop="name" content="${pageTitle}" />
  <meta itemprop="description" content="${description}" />
  <meta itemprop="image" content="${ogImage}" />

  <!-- Open Graph / Facebook / WhatsApp / LinkedIn / Telegram / Messenger -->
  <meta property="og:type" content="${ogType}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:title" content="${pageTitle}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${ogImage}" />
  <meta property="og:image:secure_url" content="${ogImage}" />
  <meta property="og:image:type" content="${ogImageType}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${pageTitle}" />
  <meta property="og:locale" content="en_US" />

${extraMeta}

  <!-- X / Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="${TWITTER_HANDLE}" />
  <meta name="twitter:creator" content="${TWITTER_HANDLE}" />
  <meta name="twitter:title" content="${pageTitle}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${ogImage}" />
  <meta name="twitter:image:alt" content="${pageTitle}" />

  <!-- Favicon -->
  <link rel="icon" type="image/png" href="/og-default.png" />

  <!-- Schema.org JSON-LD -->
${jsonLdBlock}

  <!-- Initial routing state for client React SPA -->
${initialRouteScript}

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
 * 1. News Article Meta HTML Generator
 */
function generateMetaHtml(post, slug, req = null) {
  const baseUrl = getBaseUrl(req);
  const isArticle = !!post;

  const canonicalUrl = isArticle
    ? `${baseUrl}/news/${post.slug}`
    : `${baseUrl}/`;

  const pageTitle = isArticle
    ? `${escapeHtml(post.title)} | ${SITE_NAME}`
    : `${SITE_NAME} — Official Sports Portal | Latest Football News & Live Scores`;

  const rawDescription = isArticle
    ? (post.summary || toPlainText(post.content, 160))
    : 'DX Sports – Premium Nigerian and global football news portal. Live NPFL scores, Super Eagles updates, transfer gist, video highlights, and league standings.';
  const description = escapeHtml(rawDescription.slice(0, 300));

  const rawImage = isArticle ? toAbsoluteImageUrl(post.coverImage || post.image || '', baseUrl) : DEFAULT_OG_IMAGE;
  const ogImage = rawImage;
  const ogImageType = getMimeType(rawImage);

  const authorName = isArticle && post.author
    ? (post.author.name || SITE_NAME)
    : SITE_NAME;

  const publishedTime = isArticle && post.createdAt ? new Date(post.createdAt).toISOString() : '';
  const modifiedTime = isArticle && post.updatedAt ? new Date(post.updatedAt).toISOString() : '';

  const category = isArticle ? (post.category || 'News') : '';
  const tags = isArticle && Array.isArray(post.tags) ? post.tags : [];
  const tagMetas = tags.map(t => `  <meta property="article:tag" content="${escapeHtml(t)}" />`).join('\n');

  const extraMeta = isArticle ? `  <meta property="article:published_time" content="${publishedTime}" />
  <meta property="article:modified_time" content="${modifiedTime || publishedTime}" />
  <meta property="article:author" content="${escapeHtml(authorName)}" />
  <meta property="article:section" content="${escapeHtml(category)}" />
${tagMetas}` : '';

  const jsonLd = isArticle
    ? {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: post.title,
        description: rawDescription.slice(0, 300),
        image: [ogImage],
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
        url: baseUrl,
        logo: DEFAULT_OG_IMAGE,
        sameAs: [
          'https://www.facebook.com/DXSportsbr/',
          'https://x.com/DXSportsbr',
          'https://www.youtube.com/channel/UCKTdgZGovXp1D2pdu-G7taQ'
        ]
      };

  return renderHtmlShell({
    pageTitle,
    description,
    canonicalUrl,
    ogType: isArticle ? 'article' : 'website',
    ogImage,
    ogImageType,
    author: authorName,
    jsonLd,
    initialRoute: isArticle ? { type: 'NEWS', slug: post.slug } : null,
    extraMeta
  });
}

/**
 * 2. Fixture / Match Meta HTML Generator
 */
function generateFixtureMetaHtml(match, matchId, req = null) {
  const baseUrl = getBaseUrl(req);
  if (!match) {
    return generateFixturesCenterMetaHtml(req);
  }

  const homeTeamName = match.homeTeam?.name || 'Home Team';
  const awayTeamName = match.awayTeam?.name || 'Away Team';
  const leagueName = match.league?.name || match.league?.code || 'Football Match';

  let statusText = '';
  if (match.status === 'LIVE') {
    statusText = `[LIVE ${match.currentMinute}'] ${match.homeScore} - ${match.awayScore}`;
  } else if (match.status === 'FINISHED' || match.status === 'COMPLETED') {
    statusText = `[FT: ${match.homeScore} - ${match.awayScore}]`;
  } else {
    statusText = 'Live Match Fixture';
  }

  const pageTitle = `${homeTeamName} vs ${awayTeamName} ${statusText} | ${leagueName} | ${SITE_NAME}`;

  const formattedDate = match.matchDate ? new Date(match.matchDate).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : 'Upcoming Match';

  const venueText = match.venue ? ` at ${match.venue}` : '';
  const description = match.status === 'FINISHED' || match.status === 'COMPLETED'
    ? `Full-time match result: ${homeTeamName} ${match.homeScore} - ${match.awayScore} ${awayTeamName} in ${leagueName}${venueText}. View match details, timeline, and highlights on DX SPORTS.`
    : `Match preview & live updates for ${homeTeamName} vs ${awayTeamName} in ${leagueName} on ${formattedDate}${venueText}. Follow live scores, team news, and head-to-head stats on DX SPORTS.`;

  const matchImage = match.homeTeam?.logo
    ? toAbsoluteImageUrl(match.homeTeam.logo, baseUrl)
    : (match.awayTeam?.logo ? toAbsoluteImageUrl(match.awayTeam.logo, baseUrl) : DEFAULT_OG_IMAGE);

  const canonicalUrl = `${baseUrl}/match/${match._id}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${homeTeamName} vs ${awayTeamName}`,
    sport: 'Soccer',
    startDate: match.matchDate ? new Date(match.matchDate).toISOString() : new Date().toISOString(),
    location: {
      '@type': 'Place',
      name: match.venue || `${homeTeamName} Home Ground`
    },
    homeTeam: {
      '@type': 'SportsTeam',
      name: homeTeamName
    },
    awayTeam: {
      '@type': 'SportsTeam',
      name: awayTeamName
    },
    organizer: {
      '@type': 'Organization',
      name: leagueName,
      url: baseUrl
    }
  };

  return renderHtmlShell({
    pageTitle: escapeHtml(pageTitle),
    description: escapeHtml(description),
    canonicalUrl,
    ogType: 'website',
    ogImage: matchImage,
    ogImageType: getMimeType(matchImage),
    author: SITE_NAME,
    jsonLd,
    initialRoute: { type: 'FIXTURE', matchId: String(match._id) }
  });
}

/**
 * 3. General Fixtures Center Meta HTML Generator
 */
function generateFixturesCenterMetaHtml(req = null) {
  const baseUrl = getBaseUrl(req);
  const pageTitle = `Live Football Fixtures, Results & Scores | ${SITE_NAME}`;
  const description = 'Follow live NPFL, Premier League, Champions League and global football fixtures, kick-off times, matchday previews, and real-time scores on DX SPORTS.';
  const canonicalUrl = `${baseUrl}/fixtures`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: SITE_NAME,
    url: canonicalUrl,
    logo: DEFAULT_OG_IMAGE,
    description
  };

  return renderHtmlShell({
    pageTitle,
    description,
    canonicalUrl,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageType: DEFAULT_OG_IMAGE_TYPE,
    author: SITE_NAME,
    jsonLd,
    initialRoute: { type: 'FIXTURES' }
  });
}

/**
 * 4. League Standings & Table Meta HTML Generator
 */
function generateTableMetaHtml(standings = [], league = null, req = null) {
  const baseUrl = getBaseUrl(req);
  const leagueName = league?.name || league?.code || 'NPFL';
  const pageTitle = `Official ${leagueName} League Table & Standings | ${SITE_NAME}`;

  let topSummary = '';
  if (Array.isArray(standings) && standings.length > 0) {
    const leader = standings[0]?.team?.name || standings[0]?.team?.shortName || 'Leader';
    const leaderPts = standings[0]?.points || 0;
    topSummary = ` Currently topped by ${leader} with ${leaderPts} points.`;
  }

  const description = `Check current ${leagueName} football standings, points table, matches played, goal differences, form guide, and league rankings on DX SPORTS.${topSummary}`;
  const canonicalUrl = `${baseUrl}/table`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: `${leagueName} Standings - ${SITE_NAME}`,
    url: canonicalUrl,
    logo: DEFAULT_OG_IMAGE,
    description
  };

  return renderHtmlShell({
    pageTitle,
    description,
    canonicalUrl,
    ogType: 'website',
    ogImage: DEFAULT_OG_IMAGE,
    ogImageType: DEFAULT_OG_IMAGE_TYPE,
    author: SITE_NAME,
    jsonLd,
    initialRoute: { type: 'TABLE' }
  });
}

function generateDefaultMetaHtml(req = null) {
  return generateMetaHtml(null, null, req);
}

module.exports = {
  generateMetaHtml,
  generateFixtureMetaHtml,
  generateFixturesCenterMetaHtml,
  generateTableMetaHtml,
  generateDefaultMetaHtml,
  getBaseUrl
};
