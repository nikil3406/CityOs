import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { buildings } from "@/db/schema";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);

        const cityId = searchParams.get("cityId");

        const result = await db.execute(sql`
            SELECT
                id,
                city_id AS "cityId",
                height,
                min_height AS "minHeight",
                ST_AsGeoJSON(geometry)::json AS geometry,
                created_at AS "createdAt",
                updated_at AS "updatedAt"
            FROM buildings
            WHERE city_id = ${cityId ? Number(cityId) : 1}
            ORDER BY id;
        `);

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to fetch buildings:", error);

        return NextResponse.json(
            {
                error: "Failed to fetch buildings",
            },
            {
                status: 500,
            },
        );
    }
}