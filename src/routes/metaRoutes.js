'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Post = require('../models/Post');
const Match = require('../models/Match');
const Standings = require('../models/Standings');
const League = require('../models/League');
const {
  generateMetaHtml,
  generateNewsHubMetaHtml,
  generateFixtureMetaHtml,
  generateFixturesCenterMetaHtml,
  generateTableMetaHtml
} = require('../utils/metaGenerator');

/**
 * GET /news
 * Dynamic meta tags for news hub.
 */
router.get('/news', async (req, res) => {
  try {
    const html = generateNewsHubMetaHtml(req);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(html);
  } catch (err) {
    console.error('[MetaRoute] Error generating news hub meta:', err.message);
    const html = generateNewsHubMetaHtml(req);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8').send(html);
  }
});

/**
 * GET /news/:slug
 * Full dynamic meta tags for news articles.
 */
router.get('/news/:slug', async (req, res) => {
  const { slug } = req.params;
  try {
    const cleanSlug = (slug || '').trim();
    const queryConditions = [
      { slug: new RegExp(`^${cleanSlug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    ];
    if (mongoose.isValidObjectId(cleanSlug)) {
      queryConditions.push({ _id: cleanSlug });
    }

    let post = await Post.findOne({
      $or: queryConditions,
      status: 'published'
    }).populate('author', 'name email');

    // Fallback if status field is omitted or varied in database
    if (!post) {
      post = await Post.findOne({
        $or: queryConditions
      }).populate('author', 'name email');
    }

    if (!post) {
      const html = generateMetaHtml(null, cleanSlug, req);
      return res.status(404).set('Content-Type', 'text/html; charset=utf-8').send(html);
    }

    const html = generateMetaHtml(post, cleanSlug, req);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(html);
  } catch (err) {
    console.error('[MetaRoute] Error generating meta for news slug:', slug, err.message);
    const html = generateMetaHtml(null, slug, req);
    res.status(500).set('Content-Type', 'text/html; charset=utf-8').send(html);
  }
});

/**
 * GET /match/:id or /fixtures/:id
 * Dynamic meta tags for specific match fixture.
 */
router.get(['/match/:id', '/fixtures/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    const match = await Match.findById(id).populate('homeTeam awayTeam league');
    if (!match) {
      const html = generateFixturesCenterMetaHtml(req);
      return res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
    }

    const html = generateFixtureMetaHtml(match, id, req);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=120, stale-while-revalidate=300')
      .send(html);
  } catch (err) {
    console.error('[MetaRoute] Error generating meta for match ID:', id, err.message);
    const html = generateFixturesCenterMetaHtml(req);
    res.status(200).set('Content-Type', 'text/html; charset=utf-8').send(html);
  }
});

/**
 * GET /fixtures
 * Dynamic meta tags for match center / fixtures hub.
 */
router.get('/fixtures', async (req, res) => {
  try {
    const html = generateFixturesCenterMetaHtml(req);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(html);
  } catch (err) {
    console.error('[MetaRoute] Error generating fixtures hub meta:', err.message);
    res.status(500).sendFile(require('path').join(__dirname, '../../public/index.html'));
  }
});

/**
 * GET /table, /table/:leagueCode, /standings
 * Dynamic meta tags for league standings table.
 */
router.get(['/table', '/table/:leagueCode', '/standings'], async (req, res) => {
  try {
    let league = null;
    const { leagueCode } = req.params;
    if (leagueCode) {
      league = await League.findOne({
        $or: [
          { code: leagueCode.toUpperCase() },
          { shortName: new RegExp(`^${leagueCode}$`, 'i') }
        ]
      });
    }

    if (!league) {
      league = await League.findOne({ code: 'NPFL' });
    }

    const standings = league
      ? await Standings.find({ league: league._id }).populate('team').sort({ position: 1, points: -1 })
      : await Standings.find().populate('team').sort({ position: 1, points: -1 }).limit(20);

    const html = generateTableMetaHtml(standings, league, req);
    res
      .status(200)
      .set('Content-Type', 'text/html; charset=utf-8')
      .set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600')
      .send(html);
  } catch (err) {
    console.error('[MetaRoute] Error generating table meta:', err.message);
    res.status(500).sendFile(require('path').join(__dirname, '../../public/index.html'));
  }
});

module.exports = router;
