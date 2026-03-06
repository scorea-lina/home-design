CREATE TABLE `attachment` (
	`id` text PRIMARY KEY NOT NULL,
	`email_id` text,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`storage_path` text NOT NULL,
	`extracted_text` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`email_id`) REFERENCES `source_email`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `chunk` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_type` text NOT NULL,
	`parent_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`text` text NOT NULL,
	`speaker_person_id` text,
	`source_link` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`speaker_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `markup_artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`source_attachment_id` text,
	`crop_rect` text,
	`annotations` text,
	`render_png_path` text,
	`version` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_attachment_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `meeting_transcript` (
	`id` text PRIMARY KEY NOT NULL,
	`attachment_id` text,
	`meeting_title` text,
	`meeting_date` integer,
	`text_extracted` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`attachment_id`) REFERENCES `attachment`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `person` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`role_label` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `source_email` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text,
	`thread_id` text,
	`from` text NOT NULL,
	`to` text,
	`cc` text,
	`date` integer NOT NULL,
	`subject` text NOT NULL,
	`raw_body` text NOT NULL,
	`normalized_body` text NOT NULL,
	`source_type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`tag_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`confidence` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tag_id`) REFERENCES `tag`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `todo` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL,
	`raised_by_person_id` text,
	`raised_at_date` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`raised_by_person_id`) REFERENCES `person`(`id`) ON UPDATE no action ON DELETE no action
);
