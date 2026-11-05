function parseUserAgent(userAgent = '') {
  const ua = String(userAgent || '');

  // Device classification
  let device = 'Desktop';
  if (/iPad|Tablet|(android(?!.*mobile))/i.test(ua)) {
    device = 'Tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) {
    device = 'Mobile';
  }

  // OS classification
  let os = 'Other';
  if (/Windows NT 10.0/i.test(ua)) os = 'Windows 10/11';
  else if (/Windows NT 6.3/i.test(ua)) os = 'Windows 8.1';
  else if (/Windows NT 6.1/i.test(ua)) os = 'Windows 7';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'Chrome OS';

  // Browser classification
  let browser = 'Other';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  return { device, os, browser };
}

function parseReferrer(referrer = '', currentHost = '') {
  if (!referrer || referrer.trim() === '' || referrer.trim().toLowerCase() === 'direct') {
    return { source: 'Direct', display: 'Direct / Bookmark' };
  }
  const refLower = referrer.toLowerCase();
  if (currentHost && refLower.includes(currentHost.toLowerCase())) {
    return { source: 'Direct', display: 'Direct / Internal' };
  }
  if (refLower.includes('google.') || refLower.includes('android-app://com.google')) {
    return { source: 'Google', display: 'Google Search' };
  }
  if (refLower.includes('whatsapp') || refLower.includes('com.whatsapp')) {
    return { source: 'WhatsApp', display: 'WhatsApp' };
  }
  if (refLower.includes('facebook') || refLower.includes('fb.com') || refLower.includes('com.facebook')) {
    return { source: 'Facebook', display: 'Facebook' };
  }
  if (refLower.includes('twitter') || refLower.includes('t.co') || refLower.includes('x.com')) {
    return { source: 'Twitter / X', display: 'Twitter / X' };
  }
  if (refLower.includes('instagram') || refLower.includes('com.instagram')) {
    return { source: 'Instagram', display: 'Instagram' };
  }
  if (refLower.includes('youtube') || refLower.includes('youtu.be')) {
    return { source: 'YouTube', display: 'YouTube' };
  }
  if (refLower.includes('linkedin') || refLower.includes('lnkd.in')) {
    return { source: 'LinkedIn', display: 'LinkedIn' };
  }
  if (refLower.includes('tiktok')) {
    return { source: 'TikTok', display: 'TikTok' };
  }
  if (refLower.includes('bing.') || refLower.includes('yahoo.') || refLower.includes('duckduckgo.')) {
    return { source: 'Search Engine', display: 'Search Engine' };
  }

  try {
    const urlObj = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`);
    return { source: 'External Referral', display: urlObj.hostname };
  } catch (e) {
    return { source: 'External Referral', display: referrer };
  }
}

module.exports = { parseUserAgent, parseReferrer };
