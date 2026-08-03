-- 001_memory_chapters.sql
-- Chapter definitions. Seeds run in filename order, so this must sort before
-- the fragments that reference it.
--
-- Re-runnable: conflicts on the chapter number are updated in place.

INSERT INTO memory_chapters (number, slug, title, summary)
VALUES
  (
    1,
    'waking',
    'Waking',
    'The first hours after Echo came back online, and the small things she nearly kept.'
  )
ON CONFLICT (number) DO UPDATE
SET slug    = EXCLUDED.slug,
    title   = EXCLUDED.title,
    summary = EXCLUDED.summary;
