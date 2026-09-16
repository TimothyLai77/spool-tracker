CREATE TABLE `ams_mappings` (
	`printerId` text NOT NULL,
	`channel` integer NOT NULL,
	`spoolId` text NOT NULL,
	PRIMARY KEY(`printerId`, `channel`),
	FOREIGN KEY (`printerId`) REFERENCES `printers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`spoolId`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`spoolId` text NOT NULL,
	`projectId` text,
	`filamentUsedMg` integer NOT NULL,
	`costCents` integer NOT NULL,
	`date` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`spoolId`) REFERENCES `spools`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_jobs_spoolId` ON `jobs` (`spoolId`);--> statement-breakpoint
CREATE INDEX `idx_jobs_projectId` ON `jobs` (`projectId`);--> statement-breakpoint
CREATE TABLE `printers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`ip` text NOT NULL,
	`serial` text NOT NULL,
	`accessCode` text NOT NULL,
	`model` text
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spools` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brand` text NOT NULL,
	`material` text NOT NULL,
	`colour` text NOT NULL,
	`colourHex` text,
	`finish` text,
	`initialWeightMg` integer NOT NULL,
	`usedMg` integer DEFAULT 0 NOT NULL,
	`costCents` integer NOT NULL,
	`isFinished` integer DEFAULT 0 NOT NULL,
	`notes` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `staged_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`filamentUsedMg` integer,
	`date` text NOT NULL,
	`printerId` text,
	`amsChannel` integer,
	`createdAt` text NOT NULL
);
