import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { cities, intersections } from "@/db/schema";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const cityIdParam = searchParams.get("cityId");

        const query = db
            .select({
                id: intersections.id,
                cityId: intersections.cityId,
                name: intersections.name,
                location: intersections.location,
                createdAt: intersections.createdAt,
                updatedAt: intersections.updatedAt,
            })
            .from(intersections);

        if (cityIdParam !== null) {
            const cityId = Number(cityIdParam);

            if (!Number.isInteger(cityId) || cityId <= 0) {
                return NextResponse.json(
                    {
                        error: "Invalid cityId",
                    },
                    {
                        status: 400,
                    },
                );
            }

            const result = await query
                .where(eq(intersections.cityId, cityId))
                .orderBy(asc(intersections.id));

            return NextResponse.json(result);
        }

        const result = await query.orderBy(asc(intersections.id));

        return NextResponse.json(result);
    } catch (error) {
        console.error("Failed to fetch intersections:", error);

        return NextResponse.json(
            {
                error: "Failed to fetch intersections",
            },
            {
                status: 500,
            },
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        const {
            cityId,
            name,
            longitude,
            latitude,
        } = body;

        if (
            typeof cityId !== "number" ||
            !Number.isInteger(cityId) ||
            cityId <= 0
        ) {
            return NextResponse.json(
                {
                    error: "cityId must be a positive integer",
                },
                {
                    status: 400,
                },
            );
        }

        if (
            name !== undefined &&
            (typeof name !== "string" || name.trim().length === 0)
        ) {
            return NextResponse.json(
                {
                    error: "name must be a non-empty string",
                },
                {
                    status: 400,
                },
            );
        }

        if (
            typeof longitude !== "number" ||
            longitude < -180 ||
            longitude > 180
        ) {
            return NextResponse.json(
                {
                    error: "longitude must be between -180 and 180",
                },
                {
                    status: 400,
                },
            );
        }

        if (
            typeof latitude !== "number" ||
            latitude < -90 ||
            latitude > 90
        ) {
            return NextResponse.json(
                {
                    error: "latitude must be between -90 and 90",
                },
                {
                    status: 400,
                },
            );
        }

        const city = await db
            .select({
                id: cities.id,
            })
            .from(cities)
            .where(eq(cities.id, cityId))
            .limit(1);

        if (city.length === 0) {
            return NextResponse.json(
                {
                    error: "City not found",
                },
                {
                    status: 404,
                },
            );
        }

        const result = await db
            .insert(intersections)
            .values({
                cityId,
                name: name?.trim() || null,
                location: [longitude, latitude],
            })
            .returning({
                id: intersections.id,
                cityId: intersections.cityId,
                name: intersections.name,
                location: intersections.location,
                createdAt: intersections.createdAt,
                updatedAt: intersections.updatedAt,
            });

        return NextResponse.json(result[0], {
            status: 201,
        });
    } catch (error) {
        console.error("Failed to create intersection:", error);

        return NextResponse.json(
            {
                error: "Failed to create intersection",
            },
            {
                status: 500,
            },
        );
    }
}