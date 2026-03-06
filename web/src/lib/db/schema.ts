import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const person = sqliteTable('person', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  roleLabel: text('role_label').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tag = sqliteTable('tag', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  category: text('category').notNull(), // Area | Topic
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sourceEmail = sqliteTable('source_email', {
  id: text('id').primaryKey(),
  messageId: text('message_id'),
  threadId: text('thread_id'),
  from: text('from').notNull(),
  to: text('to'),
  cc: text('cc'),
  date: integer('date', { mode: 'timestamp_ms' }).notNull(),
  subject: text('subject').notNull(),
  rawBody: text('raw_body').notNull(),
  normalizedBody: text('normalized_body').notNull(),
  sourceType: text('source_type').notNull(), // forwarded | cc | direct
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const attachment = sqliteTable('attachment', {
  id: text('id').primaryKey(),
  emailId: text('email_id').references(() => sourceEmail.id),
  filename: text('filename').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(),
  sha256: text('sha256').notNull(),
  storagePath: text('storage_path').notNull(),
  extractedText: text('extracted_text'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const meetingTranscript = sqliteTable('meeting_transcript', {
  id: text('id').primaryKey(),
  attachmentId: text('attachment_id').references(() => attachment.id),
  meetingTitle: text('meeting_title'),
  meetingDate: integer('meeting_date', { mode: 'timestamp_ms' }),
  textExtracted: text('text_extracted'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const chunk = sqliteTable('chunk', {
  id: text('id').primaryKey(),
  parentType: text('parent_type').notNull(), // email | meeting_transcript
  parentId: text('parent_id').notNull(),
  orderIndex: integer('order_index').notNull(),
  text: text('text').notNull(),
  speakerPersonId: text('speaker_person_id').references(() => person.id),
  sourceLink: text('source_link'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const todo = sqliteTable('todo', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull(), // Open | Resolved | Archived | Removed
  raisedByPersonId: text('raised_by_person_id').references(() => person.id),
  raisedAtDate: integer('raised_at_date', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const markupArtifact = sqliteTable('markup_artifact', {
  id: text('id').primaryKey(),
  sourceAttachmentId: text('source_attachment_id').references(() => attachment.id),
  cropRect: text('crop_rect'), // JSON string for now
  annotations: text('annotations'), // JSON string for now
  renderPngPath: text('render_png_path'),
  version: integer('version').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const tagAssignment = sqliteTable('tag_assignment', {
  id: text('id').primaryKey(),
  tagId: text('tag_id').notNull().references(() => tag.id),
  targetType: text('target_type').notNull(), // email | attachment | meeting_transcript | markup | todo | chunk
  targetId: text('target_id').notNull(),
  confidence: text('confidence').notNull(), // manual | auto_high | auto_low
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});
