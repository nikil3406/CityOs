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

        const result = await db.execute(sql`
            SELECT
                id,
                city_id AS "cityId",
                elevation,
                ST_AsGeoJSON(geometry)::json AS geometry
            FROM contours
            WHERE city_id = ${id}
            ORDER BY elevation;
        `);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to fetch contours:", error);

        return NextResponse.json(
            { error: "Failed to fetch contours" },
            { status: 500 },
        );
    }
}