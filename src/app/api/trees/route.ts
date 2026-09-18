import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { trees } from "@/db/schema";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const cityId = searchParams.get("cityId");

        const result = await db.execute(sql`
            SELECT
                id,
                city_id AS "cityId",
                height,
                crown_diameter AS "crownDiameter",
                ST_AsGeoJSON(location)::json AS location,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM trees
            WHERE city_id = ${cityId ? Number(cityId) : 1}
            ORDER BY id;
        `);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to fetch trees:", error);

        return NextResponse.json(
            {
                error: "Failed to fetch trees",
            },
            {
                status: 500,
            },
        );
    }
}