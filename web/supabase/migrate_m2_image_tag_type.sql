-- Add 'image' to tag_target_type_v0 enum for image tagging support.

ALTER TYPE public.tag_target_type_v0 ADD VALUE IF NOT EXISTS 'image';
