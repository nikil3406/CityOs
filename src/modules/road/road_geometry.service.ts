import { sql } from "drizzle-orm";

import { db } from "@/db";

export type Direction =
    | "NORTH"
    | "EAST"
    | "SOUTH"
    | "WEST";

export type TurnType =
    | "STRAIGHT"
    | "RIGHT"
    | "LEFT";

export type ApproachDirection =
    | "NORTH_SOUTH"
    | "EAST_WEST";

export type MovementClassification = {
    incomingSegmentId: number;
    outgoingSegmentId: number;
    incomingBearing: number;
    outgoingBearing: number;
    turn: TurnType;
};

export type IntersectionMovement = {
    incomingSegmentId: number;
    outgoingSegmentId: number;

    incomingRoadId: number;
    outgoingRoadId: number;

    incomingBearing: number;
    outgoingBearing: number;

    approach: ApproachDirection;

    turn: TurnType;
};

export async function classifyMovement(
    incomingSegmentId: number,
    outgoingSegmentId: number,
): Promise<MovementClassification | null> {
    const incomingBearing =
        await getSegmentBearing(
            incomingSegmentId,
            true,
        );

    const outgoingBearing =
        await getSegmentBearing(
            outgoingSegmentId,
            false,
        );

    if (
        incomingBearing === null ||
        outgoingBearing === null
    ) {
        return null;
    }

    return {
        incomingSegmentId,
        outgoingSegmentId,
        incomingBearing,
        outgoingBearing,
        turn: getTurnType(
            incomingBearing,
            outgoingBearing,
        ),
    };
}


/**
 * Normalize a bearing to the range 0–359 degrees.
 *
 * 0   = North
 * 90  = East
 * 180 = South
 * 270 = West
 */

export async function classifyIntersectionMovements(
    incomingSegments: {
        id: number;
        roadId: number;
    }[],
    outgoingSegments: {
        id: number;
        roadId: number;
    }[],
): Promise<IntersectionMovement[]> {
    const movements: IntersectionMovement[] = [];

    for (const incoming of incomingSegments) {
        for (const outgoing of outgoingSegments) {
            const result =
                await classifyMovement(
                    incoming.id,
                    outgoing.id,
                );

            if (!result) {
                continue;
            }

            movements.push({
                incomingSegmentId:
                    incoming.id,

                outgoingSegmentId:
                    outgoing.id,

                incomingRoadId:
                    incoming.roadId,

                outgoingRoadId:
                    outgoing.roadId,

                incomingBearing:
                    result.incomingBearing,

                outgoingBearing:
                    result.outgoingBearing,

                approach:
                    getApproachDirection(
                        result.incomingBearing,
                    ),

                turn:
                    result.turn,
            });
        }
    }

    return movements;
}

export async function getSegmentBearing(
    segmentId: number,
    reverse = false,
): Promise<number | null> {
    const result = await db.execute(sql`
        SELECT
            DEGREES(
                ST_Azimuth(
                    ${reverse
            ? sql`
                                ST_EndPoint(
                                    rs.geometry
                                )
                            `
            : sql`
                                ST_StartPoint(
                                    rs.geometry
                                )
                            `
        },
                    ${reverse
            ? sql`
                                ST_PointN(
                                    rs.geometry,
                                    ST_NPoints(
                                        rs.geometry
                                    ) - 1
                                )
                            `
            : sql`
                                ST_PointN(
                                    rs.geometry,
                                    2
                                )
                            `
        }
                )
            ) AS "bearing"
        FROM road_segments rs
        WHERE rs.id = ${segmentId}
        LIMIT 1;
    `);

    const row =
        result[0] as
        | { bearing: number | null }
        | undefined;

    if (
        !row ||
        row.bearing === null
    ) {
        return null;
    }

    return normalizeBearing(
        Number(row.bearing),
    );
}

export async function getSegmentDirection(
    segmentId: number,
    reverse = false,
) {
    const bearing =
        await getSegmentBearing(
            segmentId,
            reverse,
        );

    if (bearing === null) {
        return null;
    }

    return {
        bearing,
        direction:
            getDirection(bearing),
    };
}

export function normalizeBearing(
    bearing: number,
): number {
    return (bearing + 360) % 360;
}

/**
 * Convert a bearing into a cardinal direction.
 */
export function getDirection(
    bearing: number,
): Direction {
    const normalized =
        normalizeBearing(bearing);

    if (
        normalized >= 315 ||
        normalized < 45
    ) {
        return "NORTH";
    }

    if (
        normalized >= 45 &&
        normalized < 135
    ) {
        return "EAST";
    }

    if (
        normalized >= 135 &&
        normalized < 225
    ) {
        return "SOUTH";
    }

    return "WEST";
}

/**
 * Determine the turn made at an intersection.
 *
 * incomingBearing:
 *     direction in which the vehicle is travelling
 *     toward the intersection.
 *
 * outgoingBearing:
 *     direction in which the vehicle travels
 *     after leaving the intersection.
 */
export function getTurnType(
    incomingBearing: number,
    outgoingBearing: number,
): TurnType {
    const angle =
        normalizeBearing(
            outgoingBearing -
            incomingBearing,
        );

    /*
     * Vehicle movement geometry:
     *
     * ~90°  = right turn
     * ~180° = straight
     * ~270° = left turn
     */

    if (
        angle >= 135 &&
        angle <= 225
    ) {
        return "STRAIGHT";
    }

    if (
        angle > 45 &&
        angle < 135
    ) {
        return "RIGHT";
    }

    if (
        angle > 225 &&
        angle < 315
    ) {
        return "LEFT";
    }

    /*
     * Angles near 0° represent a U-turn
     * or an unusual geometry case.
     *
     * U-turns are not currently part of
     * our traffic-light movement model.
     */
    return "STRAIGHT";
}

export function getApproachDirection(
    bearing: number,
): ApproachDirection {
    const direction =
        getDirection(bearing);

    if (
        direction === "NORTH" ||
        direction === "SOUTH"
    ) {
        return "NORTH_SOUTH";
    }

    return "EAST_WEST";
}