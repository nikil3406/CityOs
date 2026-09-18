import "dotenv/config";

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

async function generateIntersections() {
    console.log("Generating intersections...");

    await sql`
        DELETE FROM intersections
        WHERE city_id = 1;
    `;

    const result = await sql`
        WITH road_pairs AS (
            SELECT
                r1.geometry AS geometry_1,
                r2.geometry AS geometry_2
            FROM roads r1
            JOIN roads r2
                ON r1.id < r2.id
            WHERE
                r1.city_id = 1
                AND r2.city_id = 1
                AND ST_Intersects(
                    r1.geometry,
                    r2.geometry
                )
        ),

        intersection_points AS (
            SELECT
                ST_CollectionExtract(
                    ST_Intersection(
                        geometry_1,
                        geometry_2
                    ),
                    1
                ) AS geometry
            FROM road_pairs
        ),

        points AS (
            SELECT
                (ST_Dump(geometry)).geom AS geometry
            FROM intersection_points
            WHERE NOT ST_IsEmpty(geometry)
        ),

        clustered AS (
            SELECT
                ST_SnapToGrid(
                    geometry,
                    0.00001
                ) AS geometry
            FROM points
        )

        INSERT INTO intersections (
            city_id,
            location
        )
        SELECT DISTINCT
            1,
            geometry
        FROM clustered
        WHERE ST_GeometryType(geometry) = 'ST_Point'
        RETURNING id;
    `;

    console.log(
        `Generated ${result.length} intersections.`,
    );

    await sql.end();
}

generateIntersections().catch(async (error) => {
    console.error(
        "Intersection generation failed:",
        error,
    );

    await sql.end();

    process.exit(1);
});import "dotenv/config";

