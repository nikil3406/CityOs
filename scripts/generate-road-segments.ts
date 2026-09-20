import "dotenv/config";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined");
}

const sql = postgres(databaseUrl);

const CITY_ID = 1;
const INTERSECTION_TOLERANCE_METERS = 2;

async function generateRoadSegments() {
    console.log("Generating road segments...");

    /*
     * We are rebuilding the derived routing graph.
     * The original roads table is NOT modified.
     */
    await sql`
        DELETE FROM road_segments
        WHERE road_id IN (
            SELECT id
            FROM roads
            WHERE
                city_id = ${CITY_ID}
                AND LOWER(COALESCE(type, '')) <> 'footway'
        );
    `;

    /*
     * Find every intersection that lies on every vehicle road.
     *
     * position_on_road:
     *     0 = beginning of road
     *     1 = end of road
     *
     * ST_LineLocatePoint gives us the position along
     * the original LineString.
     */
    const result = await sql`
        WITH road_intersections AS (
            SELECT
                r.id AS road_id,
                r.speed_limit_kmh,
                r.geometry AS road_geometry,
                i.id AS intersection_id,

                ST_LineLocatePoint(
                    r.geometry,
                    i.location
                ) AS position_on_road

            FROM roads r

            JOIN intersections i
                ON i.city_id = r.city_id
                AND ST_DWithin(
                    i.location::geography,
                    r.geometry::geography,
                    ${INTERSECTION_TOLERANCE_METERS}
                )

            WHERE
                r.city_id = ${CITY_ID}
                AND LOWER(COALESCE(r.type, '')) <> 'footway'
        ),

        /*
         * Remove duplicate positions caused by tiny
         * floating-point differences.
         */
        normalized_intersections AS (
            SELECT DISTINCT ON (
                road_id,
                ROUND(position_on_road::numeric, 8)
            )
                road_id,
                speed_limit_kmh,
                road_geometry,
                intersection_id,
                position_on_road

            FROM road_intersections

            ORDER BY
                road_id,
                ROUND(position_on_road::numeric, 8),
                intersection_id
        ),

        /*
         * Give each intersection its order along the road.
         */
        ordered_intersections AS (
            SELECT
                *,
                ROW_NUMBER() OVER (
                    PARTITION BY road_id
                    ORDER BY position_on_road
                ) - 1 AS sequence
            FROM normalized_intersections
        ),

        /*
         * Pair each intersection with the next one.
         */
        segment_pairs AS (
            SELECT
                current.road_id,
                current.speed_limit_kmh,

                current.intersection_id
                    AS start_intersection_id,

                next_intersection.intersection_id
                    AS end_intersection_id,

                current.sequence,

                current.position_on_road
                    AS start_position,

                next_intersection.position_on_road
                    AS end_position,

                current.road_geometry

            FROM ordered_intersections current

            JOIN ordered_intersections next_intersection
                ON next_intersection.road_id =
                   current.road_id

                AND next_intersection.sequence =
                    current.sequence + 1
        )

        INSERT INTO road_segments (
            road_id,
            start_intersection_id,
            end_intersection_id,
            sequence,
            geometry,
            length_meters,
            speed_limit_kmh
        )

        SELECT
            road_id,
            start_intersection_id,
            end_intersection_id,
            sequence,

            ST_LineSubstring(
                road_geometry,
                start_position,
                end_position
            )::geometry(LineString, 4326),

            ST_Length(
                ST_LineSubstring(
                    road_geometry,
                    start_position,
                    end_position
                )::geography
            ),

            speed_limit_kmh

        FROM segment_pairs

        WHERE
            end_position > start_position

        RETURNING id;
    `;

    console.log(
        `Generated ${result.length} road segments.`,
    );

    await sql.end();
}

generateRoadSegments().catch(
    async (error) => {
        console.error(
            "Road segment generation failed:",
            error,
        );

        await sql.end();

        process.exit(1);
    },
);