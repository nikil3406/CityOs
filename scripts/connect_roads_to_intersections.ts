import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const MAX_DISTANCE_METERS = 20;

async function connectRoadsToIntersections() {
    console.log("Connecting roads to intersections...");

    /*
     * Only connect vehicle-compatible roads.
     *
     * Footways are preserved in the database but are not
     * part of the initial vehicle road network.
     */
    const result = await sql`
        WITH road_endpoints AS (
            SELECT
                r.id AS road_id,

                ST_StartPoint(r.geometry) AS start_point,
                ST_EndPoint(r.geometry) AS end_point

            FROM roads r

            WHERE
                r.city_id = 1
                AND LOWER(COALESCE(r.type, '')) <> 'footway'
        ),

        nearest_start AS (
            SELECT
                re.road_id,
                i.id AS intersection_id,

                ST_Distance(
                    re.start_point::geography,
                    i.location::geography
                ) AS distance_meters

            FROM road_endpoints re

            CROSS JOIN LATERAL (
                SELECT
                    id,
                    location

                FROM intersections

                WHERE city_id = 1

                ORDER BY
                    location <-> re.start_point

                LIMIT 1
            ) i
        ),

        nearest_end AS (
            SELECT
                re.road_id,
                i.id AS intersection_id,

                ST_Distance(
                    re.end_point::geography,
                    i.location::geography
                ) AS distance_meters

            FROM road_endpoints re

            CROSS JOIN LATERAL (
                SELECT
                    id,
                    location

                FROM intersections

                WHERE city_id = 1

                ORDER BY
                    location <-> re.end_point

                LIMIT 1
            ) i
        )

        UPDATE roads r

        SET
            start_intersection_id = ns.intersection_id,
            end_intersection_id = ne.intersection_id,
            updated_at = NOW()

        FROM nearest_start ns
        JOIN nearest_end ne
            ON ne.road_id = ns.road_id

        WHERE
            r.id = ns.road_id
            AND ns.distance_meters <= ${MAX_DISTANCE_METERS}
            AND ne.distance_meters <= ${MAX_DISTANCE_METERS}

        RETURNING
            r.id,
            r.name,
            r.type,
            r.start_intersection_id,
            r.end_intersection_id;
    `;

    console.log(
        `Connected ${result.length} roads to intersections.`,
    );

    await sql.end();
}

connectRoadsToIntersections().catch(async (error) => {
    console.error(
        "Road-intersection connection failed:",
        error,
    );

    await sql.end();

    process.exit(1);
});