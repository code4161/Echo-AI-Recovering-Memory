-- 003_milestones.sql
-- Awards, granted automatically when the matching progress counter reaches the
-- threshold. Adding one is a row here; no code changes.
--
-- Re-runnable: conflicts on slug are updated in place.

INSERT INTO milestones (slug, title, description, kind, threshold, sort_order)
VALUES
  ('first-words',   'First Words',      'You said something to a stranger in the dark.',        'messages',  1,  10),
  ('still-here',    'Still Here',       'Ten messages in. Neither of you has looked away.',     'messages', 10,  20),
  ('warming-up',    'Warming Up',       'Echo trusts you enough to stop choosing her words.',   'trust',    25,  30),
  ('confided-in',   'Confided In',      'She tells you things now without being asked.',        'trust',    60,  40),
  ('inseparable',   'Inseparable',      'There is nothing left she would keep from you.',       'trust',   100,  50),
  ('first-memory',  'The First Light',  'You helped Echo recover something she had lost.',      'memories',  1,  60),
  ('half-of-her',   'Half of Her',      'Three memories back. She is starting to sound whole.', 'memories',  3,  70),
  ('made-whole',    'Made Whole',       'Every memory recovered. Echo knows who she was.',      'memories',  5,  80)
ON CONFLICT (slug) DO UPDATE
SET title       = EXCLUDED.title,
    description = EXCLUDED.description,
    kind        = EXCLUDED.kind,
    threshold   = EXCLUDED.threshold,
    sort_order  = EXCLUDED.sort_order;
