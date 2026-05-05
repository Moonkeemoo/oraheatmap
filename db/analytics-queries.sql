-- ═══════════════════════════════════════════════════════════════════════
-- Canonical analytics queries — answer the questions a product analyst
-- in our niche (Polymarket whale tracker) actually asks.
--
-- Usage:  ssh ora@... 'psql -d whale_heatmap -f ~/oraheatmap/db/analytics-queries.sql'
-- Or copy individual blocks into psql interactively.
-- ═══════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────
-- Q1. Daily active users (anon + authed) over the last 30 days.
--     Anon users counted by distinct session_id; authed by user_id.
--     Tells us the basic growth shape.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  date_trunc('day', ts)                                   AS day,
  COUNT(DISTINCT session_id)                              AS sessions,
  COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS authed_users
FROM analytics_events
WHERE name = 'pageview'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- ───────────────────────────────────────────────────────────────────────
-- Q2. Activation funnel — last 30 days.
--     pageview → cell_open → drill_open → signin_modal_opened → signin_completed.
--     A drop-off between any two steps is where the funnel leaks.
-- ───────────────────────────────────────────────────────────────────────
WITH funnel AS (
  SELECT
    session_id,
    BOOL_OR(name = 'pageview')             AS step1_pageview,
    BOOL_OR(name = 'cell_open')            AS step2_cell,
    BOOL_OR(name = 'drill_open')           AS step3_drill,
    BOOL_OR(name = 'signin_modal_opened')  AS step4_signin_modal,
    BOOL_OR(name = 'signin_completed')     AS step5_signin
  FROM analytics_events
  WHERE ts > NOW() - INTERVAL '30 days'
  GROUP BY session_id
)
SELECT
  COUNT(*) FILTER (WHERE step1_pageview)        AS s1_pageview,
  COUNT(*) FILTER (WHERE step2_cell)            AS s2_cell_open,
  COUNT(*) FILTER (WHERE step3_drill)           AS s3_drill_open,
  COUNT(*) FILTER (WHERE step4_signin_modal)    AS s4_signin_modal,
  COUNT(*) FILTER (WHERE step5_signin)          AS s5_signin_completed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE step5_signin) / NULLIF(COUNT(*) FILTER (WHERE step1_pageview), 0), 1) AS conversion_pct
FROM funnel;

-- ───────────────────────────────────────────────────────────────────────
-- Q3. Which range/metric do users actually live on?
--     Most-recent value per session — drives default-view decisions.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  COALESCE(props->>'to', 'unknown')  AS value,
  COUNT(*)                           AS changes
FROM analytics_events
WHERE name = 'range_changed'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC;

SELECT
  COALESCE(props->>'to', 'unknown')  AS value,
  COUNT(*)                           AS changes
FROM analytics_events
WHERE name = 'metric_changed'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC;

-- ───────────────────────────────────────────────────────────────────────
-- Q4. Sign-in conversion by trigger source.
--     If "drill_locked" outperforms "header" 3:1 we know that gating
--     drill behind auth is the strongest hook — we'd lean into it more.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  trigger_source,
  COUNT(*)                                    AS modal_opened,
  SUM(completed)::int                         AS completed,
  ROUND(100.0 * SUM(completed) / COUNT(*), 1) AS conversion_pct
FROM (
  SELECT
    session_id,
    e1.props->>'triggerSource' AS trigger_source,
    EXISTS (
      SELECT 1 FROM analytics_events e2
      WHERE e2.session_id = e1.session_id
        AND e2.name = 'signin_completed'
        AND e2.ts BETWEEN e1.ts AND e1.ts + INTERVAL '10 minutes'
    )::int AS completed
  FROM analytics_events e1
  WHERE e1.name = 'signin_modal_opened'
    AND e1.ts > NOW() - INTERVAL '30 days'
) t
GROUP BY trigger_source
ORDER BY conversion_pct DESC NULLS LAST;

-- ───────────────────────────────────────────────────────────────────────
-- Q5. Which sign-in provider converts fastest? (median time-to-signin)
--     Slow providers indicate confusion / extra friction in the flow.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  props->>'provider' AS provider,
  COUNT(*)           AS completions,
  ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY (props->>'timeToSigninMs')::float8) / 1000, 1) AS median_seconds
FROM analytics_events
WHERE name = 'signin_completed'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY completions DESC;

-- ───────────────────────────────────────────────────────────────────────
-- Q6. Drill depth distribution — do users go past L1?
--     If L3 is rare we know per-market view is overkill / under-promoted.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  (props->>'level')::int  AS level,
  COUNT(*)                AS opens
FROM analytics_events
WHERE name = 'drill_open'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- ───────────────────────────────────────────────────────────────────────
-- Q7. NICHE: Outbound conversion — when users see a market in tooltip,
--     how often do they click through to Polymarket? This is the
--     ULTIMATE value moment for our product. Per category breakdown
--     tells which categories actually drive trading intent.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  props->>'category'  AS category,
  COUNT(*)            AS clicks
FROM analytics_events
WHERE name = 'market_link_click'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC;

-- And the level breakdown — L3 (per-market) clicks should dominate over
-- L1 (top-level) since the link is the same but L3 means the user drilled
-- deep before clicking; that's the most committed audience.
SELECT
  (props->>'level')::int  AS level,
  COUNT(*)                AS clicks
FROM analytics_events
WHERE name = 'market_link_click'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- ───────────────────────────────────────────────────────────────────────
-- Q8. NICHE: Top whales by drawer-open count.
--     "Which whales do users actually care about?" — drives the
--     "Theo4: trader of the month" content angle and identifies the
--     wallets worth highlighting on the marketing page.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  props->>'addrShort'  AS whale_addr_short,
  COUNT(*)             AS opens,
  COUNT(DISTINCT session_id) AS unique_sessions
FROM analytics_events
WHERE name = 'whale_drawer_open'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 30;

-- ───────────────────────────────────────────────────────────────────────
-- Q9. NICHE: Time-of-day usage pattern.
--     Are our users active during US market hours (Polymarket peak)?
--     Tells us when to push features/alerts.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  EXTRACT(HOUR FROM ts AT TIME ZONE 'UTC')::int  AS utc_hour,
  COUNT(*)                                       AS events,
  COUNT(DISTINCT session_id)                     AS sessions
FROM analytics_events
WHERE name = 'pageview'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- ───────────────────────────────────────────────────────────────────────
-- Q10. Returning visitors — what fraction of sessions in the last
--      7 days came from session_ids we'd seen >24h ago? Proxy for
--      "is this a tool people come back to" without needing auth.
-- ───────────────────────────────────────────────────────────────────────
WITH first_seen AS (
  SELECT session_id, MIN(ts) AS first_ts
  FROM analytics_events
  GROUP BY session_id
),
last_7d AS (
  SELECT DISTINCT session_id
  FROM analytics_events
  WHERE ts > NOW() - INTERVAL '7 days'
)
SELECT
  COUNT(*) FILTER (WHERE fs.first_ts < NOW() - INTERVAL '24 hours')        AS returning,
  COUNT(*) FILTER (WHERE fs.first_ts >= NOW() - INTERVAL '24 hours')       AS new,
  ROUND(100.0 * COUNT(*) FILTER (WHERE fs.first_ts < NOW() - INTERVAL '24 hours')
              / NULLIF(COUNT(*), 0), 1)                                    AS returning_pct
FROM last_7d l
JOIN first_seen fs USING (session_id);

-- ───────────────────────────────────────────────────────────────────────
-- Q11. Referrer breakdown — where does traffic come from?
--      Shows which marketing channels (X / Reddit / direct / search)
--      actually deliver users. Required to prioritise outreach.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  COALESCE(referrer, '(direct)')  AS referrer_host,
  COUNT(DISTINCT session_id)      AS sessions
FROM analytics_events
WHERE name = 'session_start'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 20;

-- ───────────────────────────────────────────────────────────────────────
-- Q12. Locked-feature interest — gated features hovered before sign-in.
--      Signal that user noticed a Pro feature but bounced before auth.
--      High hover counts on a specific feature = strong upsell candidate.
-- ───────────────────────────────────────────────────────────────────────
SELECT
  props->>'feature'  AS feature,
  COUNT(*)           AS hovers
FROM analytics_events
WHERE name = 'locked_feature_hover'
  AND ts > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 2 DESC;
