import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { cities, intersections, roads } from "@/db/schema";

type LineString = [number, number][];

type CreateRoadBody = {
    cityId: number;
    name: string;
    startIntersectionId: number;
    endIntersectionId: number;
    geometry: LineString;
    lengthMeters: number;
    speedLimitKmh: number;
};

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const cityIdParam = searchParams.get("cityId");

        let cityId: number | undefined;

        if (cityIdParam !== null) {
            cityId = Number(cityIdParam);

            if (!Number.isInteger(cityId) || cityId <= 0) {
                return NextResponse.json(
                    { error: "cityId must be a positive integer" },
                    { status: 400 },
                );
            }
        }

        const query = db
            .select({
                id: roads.id,
                cityId: roads.cityId,
                name: roads.name,
                startIntersectionId: roads.startIntersectionId,
                endIntersectionId: roads.endIntersectionId,
                geometry: sql`
          ST_AsGeoJSON(${roads.geometry})::json
        `.as("geometry"),
                lengthMeters: roads.lengthMeters,
                speedLimitKmh: roads.speedLimitKmh,
                createdAt: roads.createdAt,
                updatedAt: roads.updatedAt,
            })
            .from(roads);

        const result =
            cityId !== undefined
                ? await query
                    .where(eq(roads.cityId, cityId))
                    .orderBy(roads.name)
                : await query.orderBy(roads.name);

        return NextResponse.json(result);
    } catch (error) {
        console.error("GET /api/roads error:", error);

        return NextResponse.json(
            { error: "Failed to fetch roads" },
            { status: 500 },
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = (await request.json()) as Partial<CreateRoadBody>;

        const {
            cityId,
            name,
            startIntersectionId,
            endIntersectionId,
            geometry,
            lengthMeters,
            speedLimitKmh,
        } = body;

        if (
            typeof cityId !== "number" ||
            !Number.isInteger(cityId) ||
            cityId <= 0
        ) {
            return NextResponse.json(
                { error: "cityId must be a positive integer" },
                { status: 400 },
            );
        }

        if (typeof name !== "string" || name.trim().length === 0) {
            return NextResponse.json(
                { error: "name is required" },
                { status: 400 },
            );
        }

        if (
            typeof startIntersectionId !== "number" ||
            !Number.isInteger(startIntersectionId) ||
            startIntersectionId <= 0
        ) {
            return NextResponse.json(
                { error: "startIntersectionId must be a positive integer" },
                { status: 400 },
            );
        }

        if (
            typeof endIntersectionId !== "number" ||
            !Number.isInteger(endIntersectionId) ||
            endIntersectionId <= 0
        ) {
            return NextResponse.json(
                { error: "endIntersectionId must be a positive integer" },
                { status: 400 },
            );
        }

        if (startIntersectionId === endIntersectionId) {
            return NextResponse.json(
                {
                    error:
                        "startIntersectionId and endIntersectionId must be different",
                },
                { status: 400 },
            );
        }

        if (!Array.isArray(geometry) || geometry.length < 2) {
            return NextResponse.json(
                { error: "geometry must contain at least two coordinate points" },
                { status: 400 },
            );
        }

        const isValidLineString = geometry.every(
            (point): point is [number, number] =>
                Array.isArray(point) &&
                point.length === 2 &&
                typeof point[0] === "number" &&
                typeof point[1] === "number" &&
                Number.isFinite(point[0]) &&
                Number.isFinite(point[1]) &&
                point[0] >= -180 &&
                point[0] <= 180 &&
                point[1] >= -90 &&
                point[1] <= 90,
        );

        if (!isValidLineString) {
            return NextResponse.json(
                {
                    error:
                        "geometry must be an array of [longitude, latitude] coordinate pairs",
                },
                { status: 400 },
            );
        }

        if (
            typeof lengthMeters !== "number" ||
            !Number.isFinite(lengthMeters) ||
            lengthMeters <= 0
        ) {
            return NextResponse.json(
                { error: "lengthMeters must be a positive number" },
                { status: 400 },
            );
        }

        if (
            typeof speedLimitKmh !== "number" ||
            !Number.isInteger(speedLimitKmh) ||
            speedLimitKmh <= 0
        ) {
            return NextResponse.json(
                { error: "speedLimitKmh must be a positive integer" },
                { status: 400 },
            );
        }

        const city = await db
            .select({ id: cities.id })
            .from(cities)
            .where(eq(cities.id, cityId))
            .limit(1);

        if (city.length === 0) {
            return NextResponse.json(
                { error: "City not found" },
                { status: 404 },
            );
        }

        const startIntersection = await db
            .select({
                id: intersections.id,
                cityId: intersections.cityId,
            })
            .from(intersections)
            .where(eq(intersections.id, startIntersectionId))
            .limit(1);

        if (startIntersection.length === 0) {
            return NextResponse.json(
                { error: "Start intersection not found" },
                { status: 404 },
            );
        }

        const endIntersection = await db
            .select({
                id: intersections.id,
                cityId: intersections.cityId,
            })
            .from(intersections)
            .where(eq(intersections.id, endIntersectionId))
            .limit(1);

        if (endIntersection.length === 0) {
            return NextResponse.json(
                { error: "End intersection not found" },
                { status: 404 },
            );
        }

        if (startIntersection[0].cityId !== cityId) {
            return NextResponse.json(
                { error: "Start intersection does not belong to this city" },
                { status: 400 },
            );
        }

        if (endIntersection[0].cityId !== cityId) {
            return NextResponse.json(
                { error: "End intersection does not belong to this city" },
                { status: 400 },
            );
        }

        const wkt = `LINESTRING(${geometry
            .map(([longitude, latitude]) => `${longitude} ${latitude}`)
            .join(", ")})`;

        const result = await db
            .insert(roads)
            .values({
                cityId,
                name: name.trim(),
                startIntersectionId,
                endIntersectionId,
                geometry: sql`ST_GeomFromText(${wkt}, 4326)`,
                lengthMeters,
                speedLimitKmh,
            })
            .returning({
                id: roads.id,
                cityId: roads.cityId,
                name: roads.name,
                startIntersectionId: roads.startIntersectionId,
                endIntersectionId: roads.endIntersectionId,
                lengthMeters: roads.lengthMeters,
                speedLimitKmh: roads.speedLimitKmh,
                createdAt: roads.createdAt,
                updatedAt: roads.updatedAt,
            });

        return NextResponse.json(result[0], { status: 201 });
    } catch (error) {
        console.error("POST /api/roads error:", error);

        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}