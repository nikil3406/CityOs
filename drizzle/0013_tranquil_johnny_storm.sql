CREATE TABLE "traffic_light_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "traffic_light_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"traffic_light_id" integer NOT NULL,
	"phase_number" integer NOT NULL,
	"from_road_id" integer NOT NULL,
	"to_road_id" integer NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "traffic_light_movements" ADD CONSTRAINT "traffic_light_movements_traffic_light_id_traffic_lights_id_fk" FOREIGN KEY ("traffic_light_id") REFERENCES "public"."traffic_lights"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_light_movements" ADD CONSTRAINT "traffic_light_movements_from_road_id_roads_id_fk" FOREIGN KEY ("from_road_id") REFERENCES "public"."roads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traffic_light_movements" ADD CONSTRAINT "traffic_light_movements_to_road_id_roads_id_fk" FOREIGN KEY ("to_road_id") REFERENCES "public"."roads"("id") ON DELETE cascade ON UPDATE no action;