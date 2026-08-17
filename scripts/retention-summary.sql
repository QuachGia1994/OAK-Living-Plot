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
SELECT
  (SELECT COUNT(*) FROM activated) AS activated_users,
  (SELECT COUNT(*) FROM first_choice) AS choice_users,
  (SELECT COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset = 1) AS d1_returners,
  (SELECT COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset = 7) AS d7_returners,
  (SELECT COUNT(DISTINCT user_id) FROM choice_days WHERE day_offset >= 7) AS day7_plus_returners,
  (SELECT COUNT(*) FROM user_depth WHERE max_episode >= 4) AS episode_4_plus_users,
  (SELECT COUNT(*) FROM user_depth WHERE max_episode >= 8) AS episode_8_plus_users;
