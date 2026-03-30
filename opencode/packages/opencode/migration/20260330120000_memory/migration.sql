CREATE TABLE `memory` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`tags` text NOT NULL DEFAULT '[]',
	`source_session` text,
	`confidence` integer NOT NULL DEFAULT 100,
	`access_count` integer NOT NULL DEFAULT 0,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`time_accessed` integer,
	CONSTRAINT `fk_memory_project_id` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `memory_project_idx` ON `memory` (`project_id`);
--> statement-breakpoint
CREATE INDEX `memory_type_idx` ON `memory` (`project_id`, `type`);
--> statement-breakpoint
CREATE INDEX `memory_confidence_idx` ON `memory` (`project_id`, `confidence`);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `memory_fts` USING fts5(
	content,
	tags,
	content='memory',
	content_rowid='rowid'
);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory BEGIN
	INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory BEGIN
	INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS memory_au AFTER UPDATE ON memory BEGIN
	INSERT INTO memory_fts(memory_fts, rowid, content, tags) VALUES ('delete', old.rowid, old.content, old.tags);
	INSERT INTO memory_fts(rowid, content, tags) VALUES (new.rowid, new.content, new.tags);
END;
