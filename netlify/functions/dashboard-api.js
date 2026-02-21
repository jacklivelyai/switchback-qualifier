const GROUP_ID = '180021804830558048';
const AUTOMATION_ID = '180021816997185231';
const LANDING_PAGE = 'https://switchback-qualifier.netlify.app';
const SUBSCRIBE_URL = 'https://switchback-qualifier.netlify.app/.netlify/functions/subscribe';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*'
};

function mlHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
}

// Fetch all subscribers from the group, paginated
async function fetchAllSubscribers(apiKey) {
  const subscribers = [];
  let cursor = null;

  while (true) {
    let url = `https://connect.mailerlite.com/api/groups/${GROUP_ID}/subscribers?limit=1000`;
    if (cursor) url += `&cursor=${cursor}`;

    const res = await fetch(url, { headers: mlHeaders(apiKey) });
    if (!res.ok) throw new Error(`MailerLite API error: ${res.status}`);

    const data = await res.json();
    subscribers.push(...(data.data || []));

    if (data.meta?.next_cursor) {
      cursor = data.meta.next_cursor;
    } else {
      break;
    }
  }

  return subscribers;
}

// Fetch automation details
async function fetchAutomation(apiKey) {
  const res = await fetch(
    `https://connect.mailerlite.com/api/automations/${AUTOMATION_ID}`,
    { headers: mlHeaders(apiKey) }
  );
  if (!res.ok) throw new Error(`Automation fetch error: ${res.status}`);
  return res.json();
}

// Aggregate subscriber stats by ad_variant
function aggregateStats(subscribers) {
  const variants = {};

  for (const sub of subscribers) {
    const variant = sub.fields?.ad_variant || 'unknown';

    if (!variants[variant]) {
      variants[variant] = { count: 0, opened: 0, clicked: 0, sent: 0 };
    }

    variants[variant].count++;
    if (sub.opened_count > 0) variants[variant].opened++;
    if (sub.clicked_count > 0) variants[variant].clicked++;
    if (sub.sent_count > 0) variants[variant].sent++;
  }

  return variants;
}

// ?action=stats handler
async function handleStats(apiKey) {
  const [subscribers, automationRes] = await Promise.all([
    fetchAllSubscribers(apiKey),
    fetchAutomation(apiKey)
  ]);

  const automation = automationRes.data || automationRes;
  const variants = aggregateStats(subscribers);
  const total = subscribers.length;

  const variantSummary = {};
  for (const [name, data] of Object.entries(variants)) {
    variantSummary[name] = {
      count: data.count,
      percentage: total > 0 ? ((data.count / total) * 100).toFixed(1) : '0.0',
      sent: data.sent,
      opened: data.opened,
      clicked: data.clicked,
      openRate: data.sent > 0 ? ((data.opened / data.sent) * 100).toFixed(1) : '0.0',
      clickRate: data.sent > 0 ? ((data.clicked / data.sent) * 100).toFixed(1) : '0.0'
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      total,
      variants: variantSummary,
      automation: {
        name: automation.name || 'Unknown',
        enabled: automation.enabled || false,
        broken: automation.broken || false,
        stats: automation.stats || {},
        emails_count: automation.emails_count || 0,
        queue_count: automation.stats?.queue_count || 0,
        completed_count: automation.stats?.completed_count || 0,
        sent: automation.stats?.sent_count || 0,
        opens: automation.stats?.open_count || 0,
        clicks: automation.stats?.click_count || 0,
        openRate: (automation.stats?.sent_count > 0)
          ? ((automation.stats.open_count / automation.stats.sent_count) * 100).toFixed(1)
          : '0.0',
        clickRate: (automation.stats?.sent_count > 0)
          ? ((automation.stats.click_count / automation.stats.sent_count) * 100).toFixed(1)
          : '0.0'
      },
      fetchedAt: new Date().toISOString()
    })
  };
}

// ?action=test-pipeline handler
async function handleTestPipeline(apiKey) {
  const checks = [];

  // 1. API key configured
  checks.push({
    name: 'API Key',
    pass: !!apiKey,
    detail: apiKey ? 'Configured' : 'Missing MAILERLITE_API_KEY env var'
  });

  // 2. Landing page returns 200
  try {
    const res = await fetch(LANDING_PAGE, { method: 'GET', redirect: 'follow' });
    checks.push({
      name: 'Landing Page',
      pass: res.status === 200,
      detail: `HTTP ${res.status}`
    });
  } catch (err) {
    checks.push({ name: 'Landing Page', pass: false, detail: err.message });
  }

  // 3. Subscribe function deployed (GET should return 405)
  try {
    const res = await fetch(SUBSCRIBE_URL, { method: 'GET' });
    checks.push({
      name: 'Subscribe Function',
      pass: res.status === 405,
      detail: res.status === 405 ? 'Deployed (405 on GET as expected)' : `Unexpected HTTP ${res.status}`
    });
  } catch (err) {
    checks.push({ name: 'Subscribe Function', pass: false, detail: err.message });
  }

  // 4. MailerLite group exists
  if (apiKey) {
    try {
      const res = await fetch(
        `https://connect.mailerlite.com/api/groups/${GROUP_ID}`,
        { headers: mlHeaders(apiKey) }
      );
      const data = await res.json();
      checks.push({
        name: 'MailerLite Group',
        pass: res.ok,
        detail: res.ok ? `"${data.data?.name}" (${data.data?.active_count || 0} active)` : `HTTP ${res.status}`
      });
    } catch (err) {
      checks.push({ name: 'MailerLite Group', pass: false, detail: err.message });
    }

    // 5. Automation enabled and not broken
    try {
      const res = await fetch(
        `https://connect.mailerlite.com/api/automations/${AUTOMATION_ID}`,
        { headers: mlHeaders(apiKey) }
      );
      const data = await res.json();
      const auto = data.data || data;
      const enabled = auto.enabled === true;
      const broken = auto.broken === true;
      checks.push({
        name: 'Automation',
        pass: enabled && !broken,
        detail: enabled
          ? (broken ? 'Enabled but BROKEN' : 'Enabled and healthy')
          : 'Disabled'
      });
    } catch (err) {
      checks.push({ name: 'Automation', pass: false, detail: err.message });
    }
  } else {
    checks.push({ name: 'MailerLite Group', pass: false, detail: 'Skipped (no API key)' });
    checks.push({ name: 'Automation', pass: false, detail: 'Skipped (no API key)' });
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      checks,
      allPassed: checks.every(c => c.pass),
      testedAt: new Date().toISOString()
    })
  };
}

exports.handler = async (event) => {
  const action = event.queryStringParameters?.action;

  if (!action || !['stats', 'test-pipeline'].includes(action)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing or invalid ?action= parameter. Use stats or test-pipeline.' })
    };
  }

  const apiKey = process.env.MAILERLITE_API_KEY;

  try {
    if (action === 'stats') return await handleStats(apiKey);
    if (action === 'test-pipeline') return await handleTestPipeline(apiKey);
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
