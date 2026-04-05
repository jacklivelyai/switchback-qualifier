const GRAPH_API = 'https://graph.facebook.com/v19.0';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

const FIELDS = 'spend,impressions,inline_link_clicks,cost_per_inline_link_click,account_currency,reach,frequency,cpm,ctr,quality_ranking,engagement_rate_ranking,conversion_rate_ranking';

// In-memory cache -- survives across warm invocations of the same Lambda container.
// Netlify keeps containers warm for ~5-15 minutes between requests.
const cache = { data: null, timestamp: 0 };
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

async function fetchInsights(accountId, token, datePreset) {
  const url = `${GRAPH_API}/${accountId}/insights?date_preset=${datePreset}&fields=${FIELDS}&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Facebook API ${res.status}: ${err.error?.message || 'Unknown error'}`);
  }
  const data = await res.json();
  return data.data?.[0] || null;
}

function parseInsights(raw) {
  if (!raw) return null;
  return {
    spend: parseFloat(raw.spend || 0),
    impressions: parseInt(raw.impressions || 0),
    linkClicks: parseInt(raw.inline_link_clicks || 0),
    cpc: parseFloat(raw.cost_per_inline_link_click || 0),
    currency: raw.account_currency || 'GBP',
    reach: parseInt(raw.reach || 0),
    frequency: parseFloat(raw.frequency || 0),
    cpm: parseFloat(raw.cpm || 0),
    ctr: parseFloat(raw.ctr || 0),
    qualityRanking: raw.quality_ranking || null,
    engagementRanking: raw.engagement_rate_ranking || null,
    conversionRanking: raw.conversion_rate_ranking || null
  };
}

exports.handler = async (event) => {
  const action = event.queryStringParameters?.action;

  if (action !== 'insights') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Use ?action=insights' })
    };
  }

  // Serve from cache if fresh
  const now = Date.now();
  if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...cache.data, cached: true })
    };
  }

  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  const accountId = process.env.FACEBOOK_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing FACEBOOK_ACCESS_TOKEN or FACEBOOK_AD_ACCOUNT_ID env vars' })
    };
  }

  try {
    const [yesterday, last7d] = await Promise.all([
      fetchInsights(accountId, token, 'yesterday'),
      fetchInsights(accountId, token, 'last_7d')
    ]);

    const result = {
      yesterday: parseInsights(yesterday),
      last7d: parseInsights(last7d),
      fetchedAt: new Date().toISOString()
    };

    // Store in cache
    cache.data = result;
    cache.timestamp = now;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ...result, cached: false })
    };
  } catch (err) {
    // If Facebook fails but we have stale cache, serve it rather than erroring
    if (cache.data) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ...cache.data, cached: true, stale: true })
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
