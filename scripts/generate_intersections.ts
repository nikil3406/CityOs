import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const CITY_ID = 1;
const ENDPOINT_TOLERANCE_METERS = 2;

async function generateIntersections() {
    console.log(
        "Generating vehicle-road intersections...",
    );

    await sql`
        DELETE FROM intersections
        WHERE city_id = ${CITY_ID};
    `;

    const result = await sql`
        WITH vehicle_roads AS (
            SELECT
                id,
                geometry
            FROM roads
            WHERE
                city_id = ${CITY_ID}
                AND LOWER(
                    COALESCE(type, '')
                ) <> 'footway'
        ),

        road_endpoints AS (
            SELECT
                id AS road_id,
                'START' AS endpoint_type,
                ST_Transform(
                    ST_StartPoint(geometry),
                    3857
                ) AS geometry
            FROM vehicle_roads

            UNION ALL

            SELECT
                id AS road_id,
                'END' AS endpoint_type,
                ST_Transform(
                    ST_EndPoint(geometry),
                    3857
                ) AS geometry
            FROM vehicle_roads
        ),

        clustered AS (
            SELECT
                *,
                ST_ClusterDBSCAN(
                    geometry,
                    eps := ${ENDPOINT_TOLERANCE_METERS},
                    minpoints := 2
                ) OVER () AS cluster_id
            FROM road_endpoints
        ),

        cluster_points AS (
            SELECT
                cluster_id,
                ST_Centroid(
                    ST_Collect(geometry)
                ) AS geometry
            FROM clustered
            WHERE cluster_id IS NOT NULL
            GROUP BY cluster_id
        )

        INSERT INTO intersections (
            city_id,
            location
        )
        SELECT
            ${CITY_ID},
            ST_Transform(
                geometry,
                4326
            )
        FROM cluster_points
        RETURNING id;
    `;

    console.log(
        `Generated ${result.length} vehicle intersections.`,
    );

    await sql.end();
}

generateIntersections().catch(
    async (error) => {
        console.error(
            "Intersection generation failed:",
            error,
        );

        await sql.end();

        process.exit(1);
    },
);