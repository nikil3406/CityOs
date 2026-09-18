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
                id,
                city_id AS "cityId",
                ST_AsGeoJSON(geometry)::json AS geometry
            FROM water_areas
            WHERE city_id = ${id}
            ORDER BY id;
        `);

        const lines = await db.execute(sql`
            SELECT
                id,
                city_id AS "cityId",
                ST_AsGeoJSON(geometry)::json AS geometry
            FROM water_lines
            WHERE city_id = ${id}
            ORDER BY id;
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