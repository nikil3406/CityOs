CREATE TABLE "buildings" (
    "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    "city_id" integer NOT NULL,
    "height" real,
    "min_height" real,
    "geometry" geometry(MultiPolygon, 4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "buildings"
ADD CONSTRAINT "buildings_city_id_cities_id_fk"
FOREIGN KEY ("city_id")
REFERENCES "public"."cities"("id")
ON DELETE cascade
ON UPDATE no action;