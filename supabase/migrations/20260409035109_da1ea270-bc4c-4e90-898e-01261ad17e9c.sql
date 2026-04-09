
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_style text DEFAULT 'preview';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_image text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_title text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail_subtitle text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_image text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_title text;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS checkout_description text;
