CREATE TABLE "intersections" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "intersections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"city_id" integer NOT NULL,
	"name" text,
	"location" geometry(point) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "roads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"city_id" integer NOT NULL,
	"name" text NOT NULL,
	"start_intersection_id" integer NOT NULL,
	"end_intersection_id" integer NOT NULL,
	"geometry" geometry(point) NOT NULL,
	"length_meters" integer NOT NULL,
	"speed_limit_kmh" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "intersections" ADD CONSTRAINT "intersections_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_start_intersection_id_intersections_id_fk" FOREIGN KEY ("start_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roads" ADD CONSTRAINT "roads_end_intersection_id_intersections_id_fk" FOREIGN KEY ("end_intersection_id") REFERENCES "public"."intersections"("id") ON DELETE cascade ON UPDATE no action;