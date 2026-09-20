import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const CITY_ID = 1;
const TOLERANCE_METERS = 2;

async function addMissingRoadEndpoints() {
    console.log("Finding missing road endpoint nodes...");

    const result = await sql`
        WITH vehicle_roads AS (
            SELECT
                id,
                geometry
            FROM roads
            WHERE
                city_id = ${CITY_ID}
                AND LOWER(COALESCE(type, '')) <> 'footway'
        ),

        endpoints AS (
            SELECT
                id AS road_id,
                'START' AS endpoint_type,
                ST_StartPoint(geometry) AS location
            FROM vehicle_roads

            UNION ALL

            SELECT
                id AS road_id,
                'END' AS endpoint_type,
                ST_EndPoint(geometry) AS location
            FROM vehicle_roads
        ),

        missing_endpoints AS (
            SELECT
                e.road_id,
                e.endpoint_type,
                e.location
            FROM endpoints e
            WHERE NOT EXISTS (
                SELECT 1
                FROM intersections i
                WHERE
                    i.city_id = ${CITY_ID}
                    AND ST_DWithin(
                        i.location::geography,
                        e.location::geography,
                        ${TOLERANCE_METERS}
                    )
            )
        )

        INSERT INTO intersections (
            city_id,
            location
        )

        SELECT
            ${CITY_ID},
            location

        FROM missing_endpoints

        RETURNING id;
    `;

    console.log(
        `Added ${result.length} missing endpoint nodes.`,
    );

    await sql.end();
}

addMissingRoadEndpoints().catch(
    async (error) => {
        console.error(
            "Failed to add missing road endpoints:",
            error,
        );

        await sql.end();

        process.exit(1);
    },
);