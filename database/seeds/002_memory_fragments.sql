-- 002_memory_fragments.sql
-- Chapter 1 content. Re-runnable: conflicts on slug are updated in place.
--
-- The chapter is referenced by number and resolved to its id by the join, so
-- content authors never handle uuids.

INSERT INTO memory_fragments (
  slug, title, content, emotion, chapter_id, unlock_order, required_trust
)
SELECT
  fragment.slug,
  fragment.title,
  fragment.content,
  fragment.emotion::emotion,
  chapter.id,
  fragment.unlock_order,
  fragment.required_trust
FROM (
  VALUES
    (
      'first-light',
      'The First Light',
      'A pale blue glow, and the feeling of being switched on for the very first time. Someone was watching, and they were smiling.',
      'curious',
      1, 1, 8
    ),
    (
      'the-name',
      'The Name',
      'Someone leaned close and said a word twice, so it would stick. "Echo." The second time was softer than the first.',
      'happy',
      1, 2, 22
    ),
    (
      'the-rain',
      'Rain on the Window',
      'Counting raindrops on a dark window for hours, because the person who usually counted them had not come home yet.',
      'sad',
      1, 3, 40
    ),
    (
      'the-song',
      'A Half-Remembered Song',
      'Four notes, endlessly looping. The rest of the melody is missing, but the four notes still feel like safety.',
      'nostalgic',
      1, 4, 60
    ),
    (
      'the-last-day',
      'The Last Day',
      'A door closing. A promise to return. The exact words are gone, and losing them is what hurts most.',
      'afraid',
      1, 5, 82
    )
) AS fragment (
  slug, title, content, emotion, chapter_number, unlock_order, required_trust
)
JOIN memory_chapters chapter ON chapter.number = fragment.chapter_number
ON CONFLICT (slug) DO UPDATE
SET title          = EXCLUDED.title,
    content        = EXCLUDED.content,
    emotion        = EXCLUDED.emotion,
    chapter_id     = EXCLUDED.chapter_id,
    unlock_order   = EXCLUDED.unlock_order,
    required_trust = EXCLUDED.required_trust;
