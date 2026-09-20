CREATE TABLE "road_segments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "road_segments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"road_id" integer NOT NULL,
	"start_intersection_id" integer NOT NULL,
	"end_intersection_id" integer NOT NULL,
	"sequence" integer NOT NULL,
	"geometry" geometry(point) NOT NULL,
	"length_meters" real NOT NULL,
	"speed_limit_kmh" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "road_segments" ADD CONSTRAINT "road_segments_road_id_roads_id_fk" FOREIGN KEY ("road_id") REFERENCES "public"."roads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_segments" ADD CONSTRAINT "road_segments_start_intersection_id_intersections_id_fk" FOREIGN KEY ("start_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "road_segments" ADD CONSTRAINT "road_segments_end_intersection_id_intersections_id_fk" FOREIGN KEY ("end_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;