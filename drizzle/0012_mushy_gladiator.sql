CREATE TABLE "traffic_light_phases" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "traffic_light_phases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"traffic_light_id" integer NOT NULL,
	"phase_number" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traffic_lights" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "traffic_lights_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"city_id" integer NOT NULL,
	"intersection_id" integer NOT NULL,
	"cycle_duration" integer DEFAULT 46 NOT NULL,
	"current_phase" integer DEFAULT 1 NOT NULL,
	"phase_elapsed" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vehicle_routes" ALTER COLUMN "road_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicle_routes" ADD COLUMN "segment_id" integer;--> statement-breakpoint
ALTER TABLE "vehicle_routes" ADD COLUMN "is_reverse" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "vehicles" ADD COLUMN "current_segment_id" integer;--> statement-breakpoint
ALTER TABLE "traffic_light_phases" ADD CONSTRAINT "traffic_light_phases_traffic_light_id_traffic_lights_id_fk" FOREIGN KEY ("traffic_light_id") REFERENCES "public"."traffic_lights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_lights" ADD CONSTRAINT "traffic_lights_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_lights" ADD CONSTRAINT "traffic_lights_intersection_id_intersections_id_fk" FOREIGN KEY ("intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_routes" ADD CONSTRAINT "vehicle_routes_segment_id_road_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."road_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_current_segment_id_road_segments_id_fk" FOREIGN KEY ("current_segment_id") REFERENCES "public"."road_segments"("id") ON DELETE set null ON UPDATE no action;