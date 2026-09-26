CREATE TABLE "simulation_metrics" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "simulation_metrics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"simulation_run_id" integer NOT NULL,
	"simulation_time" integer NOT NULL,
	"total_vehicles" integer DEFAULT 0 NOT NULL,
	"active_vehicles" integer DEFAULT 0 NOT NULL,
	"completed_vehicles" integer DEFAULT 0 NOT NULL,
	"waiting_vehicles" integer DEFAULT 0 NOT NULL,
	"signal_waiting_vehicles" integer DEFAULT 0 NOT NULL,
	"average_speed_kmh" real DEFAULT 0 NOT NULL,
	"average_travel_time_seconds" real DEFAULT 0 NOT NULL,
	"active_queues" integer DEFAULT 0 NOT NULL,
	"maximum_queue_vehicles" integer DEFAULT 0 NOT NULL,
	"average_queue_length_meters" real DEFAULT 0 NOT NULL,
	"total_distance_meters" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "simulation_metrics" ADD CONSTRAINT "simulation_metrics_simulation_run_id_simulation_runs_id_fk" FOREIGN KEY ("simulation_run_id") REFERENCES "public"."simulation_runs"("id") ON DELETE cascade ON UPDATE no action;