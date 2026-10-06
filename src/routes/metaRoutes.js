'use strict';

const express = require('express');
const router = express.Router();
const Post = require('../models/Post');
const { generateMetaHtml } = require('../utils/metaGenerator');

/**
 * GET /news/:slug
 *
 * Returns a server-rendered HTML page containing article-specific Open Graph,
 * Twitter Card, JSON-LD and SEO meta tags so that ALL social media crawlers
 * (WhatsApp, Facebook, X/Twitter, LinkedIn, Telegram, Discord, Reddit,
 *  Pinterest, Slack, Teams, iMessage, Threads, Messenger…) receive the correct
 * metadata without needing a browser/JavaScript.
 *
 * Human visitors get the same HTML shell; the embedded <script> sets
 * window.__DX_INITIAL_SLUG__ so the React SPA auto-opens the matching article
 * modal after hydration.
 */
router.get('/:slug', async (req, res) => {
  const { slug } = req.params;

  try {
    const post = await Post.findOne({ slug, status: 'published' }).populate('author', 'name email');

    if (!post) {
      // Article not found — return 404 with default DX SPORTS meta
      const html = generateMetaHtml(null, slug);
      return res.status(404).set('Content-Type', 'text/html').send(html);
    }

    const html = generateMetaHtml(post, slug);

    // Cache: allow public CDN/proxy caching for 5 minutes,
    // stale-while-revalidate for 10 more minutes.
    // This is short enough that updated articles are re-crawled quickly.
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(html);

  } catch (err) {
    console.error('[MetaRoute] Error generating meta page for slug:', slug, err.message);
    // Fail gracefully — return default meta rather than crashing
    const html = generateMetaHtml(null, slug);
    res.status(500).set('Content-Type', 'text/html').send(html);
  }
});

module.exports = router;
