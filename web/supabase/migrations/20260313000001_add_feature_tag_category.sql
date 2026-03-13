-- Add 'feature' to tag_category_v0 enum for feature-level tags.

ALTER TYPE public.tag_category_v0 ADD VALUE IF NOT EXISTS 'feature';
