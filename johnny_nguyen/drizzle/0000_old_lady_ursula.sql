CREATE TABLE "admin_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"ip_hash" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"succeeded" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competencies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"why" text NOT NULL,
	"horizon_type" text DEFAULT 'none' NOT NULL,
	"horizon_value" text,
	"custom_start" date,
	"custom_end" date,
	"parent_goal_id" text,
	"kind" text DEFAULT 'skill' NOT NULL,
	"status" text DEFAULT 'backlog' NOT NULL,
	"competency_id" text NOT NULL,
	"started_on" date,
	"closed_on" date,
	"close_note" text,
	"est_hours" real,
	"cost" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_horizon_type_valid" CHECK (horizon_type in ('none', 'monthly', 'quarterly', 'yearly', 'custom')),
	CONSTRAINT "goals_kind_valid" CHECK (kind in ('skill', 'certification', 'domain', 'role', 'project')),
	CONSTRAINT "goals_status_valid" CHECK (status in ('active', 'paused', 'backlog', 'done', 'dropped')),
	CONSTRAINT "goals_dropped_needs_note" CHECK (status <> 'dropped' or close_note is not null),
	CONSTRAINT "goals_horizon_value_matches_type" CHECK (case when horizon_type in ('none', 'custom') then horizon_value is null else horizon_value is not null end)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"competency_id" text NOT NULL,
	"evidence_url" text,
	"evidence_note" text,
	"target_date" date,
	"completed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_status_valid" CHECK (status in ('todo', 'doing', 'done')),
	CONSTRAINT "milestones_done_needs_evidence" CHECK (status <> 'done' or evidence_url is not null or evidence_note is not null)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"goal_id" text NOT NULL,
	"milestone_id" text,
	"title" text NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"effort" text DEFAULT 'M' NOT NULL,
	"started_on" date,
	"completed_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_valid" CHECK (status in ('todo', 'doing', 'done')),
	CONSTRAINT "tasks_effort_valid" CHECK (effort in ('S', 'M', 'L'))
);
--> statement-breakpoint
CREATE TABLE "wins" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"happened_on" date NOT NULL,
	"competency_id" text NOT NULL,
	"impact_note" text DEFAULT '' NOT NULL,
	"evidence_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_goal_id_goals_id_fk" FOREIGN KEY ("parent_goal_id") REFERENCES "public"."goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wins" ADD CONSTRAINT "wins_competency_id_competencies_id_fk" FOREIGN KEY ("competency_id") REFERENCES "public"."competencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_attempts_ip_time_idx" ON "admin_attempts" USING btree ("ip_hash","attempted_at");--> statement-breakpoint
CREATE INDEX "goals_status_idx" ON "goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "goals_parent_idx" ON "goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "goals_competency_idx" ON "goals" USING btree ("competency_id");--> statement-breakpoint
CREATE INDEX "milestones_goal_idx" ON "milestones" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "milestones_competency_idx" ON "milestones" USING btree ("competency_id");--> statement-breakpoint
CREATE INDEX "milestones_completed_at_idx" ON "milestones" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "tasks_goal_idx" ON "tasks" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "tasks_milestone_idx" ON "tasks" USING btree ("milestone_id");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wins_happened_on_idx" ON "wins" USING btree ("happened_on");--> statement-breakpoint
CREATE INDEX "wins_competency_idx" ON "wins" USING btree ("competency_id");