CREATE TABLE "cities" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"country" text NOT NULL,
	"center" geometry(point) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
