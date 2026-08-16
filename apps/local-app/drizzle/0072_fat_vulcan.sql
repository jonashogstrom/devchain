CREATE TABLE `paired_device_workspace_grants` (
	`device_kid` text NOT NULL,
	`workspace_id` text NOT NULL,
	PRIMARY KEY(`device_kid`, `workspace_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `project_workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_workspaces_name_ci_idx` ON `project_workspaces` (lower("name"));--> statement-breakpoint
CREATE INDEX `project_workspaces_position_idx` ON `project_workspaces` (`position`,`id`);--> statement-breakpoint
INSERT INTO `project_workspaces` (`id`, `name`, `is_default`, `position`, `created_at`, `updated_at`)
VALUES ('0defa017-0000-4000-8000-000000000001', 'Default', 1, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);--> statement-breakpoint
ALTER TABLE `projects` ADD `workspace_id` text DEFAULT '0defa017-0000-4000-8000-000000000001' NOT NULL;
