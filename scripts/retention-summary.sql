WITH first_choice AS (
  SELECT p.user_id, MIN(cc.committed_at) AS first_choice_at
  FROM choice_commits cc
  JOIN plots p ON p.id = cc.plot_id
  GROUP BY p.user_id
),
choice_days AS (
  SELECT DISTINCT
    p.user_id,
    CAST(
      julianday(date(cc.committed_at / 1000, 'unixepoch')) -
      julianday(date(fc.first_choice_at / 1000, 'unixepoch'))
      AS INTEGER
    ) AS day_offset
  FROM choice_commits cc
  JOIN plots p ON p.id = cc.plot_id
  JOIN first_choice fc ON fc.user_id = p.user_id
),
activated AS (
  SELECT DISTINCT p.user_id
  FROM plots p
  WHERE EXISTS (SELECT 1 FROM episodes e WHERE e.plot_id = p.id)
),
user_depth AS (
  SELECT p.user_id, MAX(e.episode_number) AS max_episode
  FROM plots p
  JOIN episodes e ON e.plot_id = p.id
  GROUP BY p.user_id
)
SELECT 'activated_users' AS metric, COUNT(*) AS value FROM activated
UNION ALL
SELECT 'choice_users', COUNT(*) FROM first_choice
UNION ALL
SELECT 'd1_returners', COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset = 1
UNION ALL
SELECT 'd7_returners', COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset = 7
UNION ALL
SELECT 'day7_plus_returners', COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset >= 7
UNION ALL
SELECT 'episode_4_plus_users', COUNT(*) FROM user_depth WHERE max_episode >= 4
UNION ALL
SELECT 'episode_8_plus_users', COUNT(*) FROM user_depth WHERE max_episode >= 8;
