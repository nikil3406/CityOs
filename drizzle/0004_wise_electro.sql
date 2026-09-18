CREATE TABLE "trees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"city_id" integer NOT NULL,
	"height" real,
	"crown_diameter" real,
	"location" geometry(point) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trees" ADD CONSTRAINT "trees_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE cascade ON UPDATE no action;