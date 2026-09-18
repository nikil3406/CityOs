import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const cityId = searchParams.get("cityId");

        const id = cityId ? Number(cityId) : 1;

        if (!Number.isInteger(id) || id <= 0) {
            return NextResponse.json(
                { error: "Invalid cityId" },
                { status: 400 },
            );
        }

        const areas = await db.execute(sql`
    SELECT
        wa.id,
        wa.city_id AS "cityId",
        ST_AsGeoJSON(
            ST_Multi(
                ST_CollectionExtract(
                    ST_Intersection(
                        wa.geometry,
                        c.boundary
                    ),
                    3
                )
            )
        )::json AS geometry
    FROM water_areas wa
    JOIN cities c
        ON c.id = wa.city_id
    WHERE wa.city_id = ${id}
      AND c.boundary IS NOT NULL
      AND ST_Intersects(
          wa.geometry,
          c.boundary
      )
    ORDER BY wa.id;
`);

        const lines = await db.execute(sql`
    SELECT
        wl.id,
        wl.city_id AS "cityId",
        ST_AsGeoJSON(
            ST_Multi(
                ST_CollectionExtract(
                    ST_Intersection(
                        wl.geometry,
                        c.boundary
                    ),
                    2
                )
            )
        )::json AS geometry
    FROM water_lines wl
    JOIN cities c
        ON c.id = wl.city_id
    WHERE wl.city_id = ${id}
      AND c.boundary IS NOT NULL
      AND ST_Intersects(
          wl.geometry,
          c.boundary
      )
    ORDER BY wl.id;
`);

        return NextResponse.json({
            areas,
            lines,
        });
    } catch (error) {
        console.error("Failed to fetch waterways:", error);

        return NextResponse.json(
            {
                error: "Failed to fetch waterways",
            },
            {
                status: 500,
            },
        );
    }
}