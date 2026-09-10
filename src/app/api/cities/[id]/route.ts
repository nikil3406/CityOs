import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { cities } from "@/db/schema";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const cityId = Number(id);

    if (!Number.isInteger(cityId) || cityId <= 0) {
      return NextResponse.json(
        {
          error: "Invalid city ID",
        },
        {
          status: 400,
        },
      );
    }

    const result = await db
      .select({
        id: cities.id,
        name: cities.name,
        country: cities.country,
        center: cities.center,
        createdAt: cities.createdAt,
        updatedAt: cities.updatedAt,
      })
      .from(cities)
      .where(eq(cities.id, cityId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: "City not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Failed to fetch city:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch city",
      },
      {
        status: 500,
      },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const cityId = Number(id);

    if (!Number.isInteger(cityId) || cityId <= 0) {
      return NextResponse.json(
        {
          error: "Invalid city ID",
        },
        {
          status: 400,
        },
      );
    }

    const body = await request.json();

    const {
      name,
      country,
      longitude,
      latitude,
    } = body;

    if (
      name === undefined &&
      country === undefined &&
      longitude === undefined &&
      latitude === undefined
    ) {
      return NextResponse.json(
        {
          error: "No fields provided for update",
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
      country !== undefined &&
      (typeof country !== "string" || country.trim().length === 0)
    ) {
      return NextResponse.json(
        {
          error: "country must be a non-empty string",
        },
        {
          status: 400,
        },
      );
    }

    if (
      longitude !== undefined &&
      (typeof longitude !== "number" ||
        longitude < -180 ||
        longitude > 180)
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
      latitude !== undefined &&
      (typeof latitude !== "number" ||
        latitude < -90 ||
        latitude > 90)
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

    const updateData: {
      name?: string;
      country?: string;
      center?: [number, number];
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (name !== undefined) {
      updateData.name = name.trim();
    }

    if (country !== undefined) {
      updateData.country = country.trim();
    }

    if (longitude !== undefined || latitude !== undefined) {
      const existingCity = await db
        .select({
          center: cities.center,
        })
        .from(cities)
        .where(eq(cities.id, cityId))
        .limit(1);

      if (existingCity.length === 0) {
        return NextResponse.json(
          {
            error: "City not found",
          },
          {
            status: 404,
          },
        );
      }

      const currentCenter = existingCity[0].center;

      const currentLongitude = currentCenter?.[0];
      const currentLatitude = currentCenter?.[1];

      const newLongitude =
        longitude !== undefined
          ? longitude
          : currentLongitude;

      const newLatitude =
        latitude !== undefined
          ? latitude
          : currentLatitude;

      if (
        typeof newLongitude !== "number" ||
        typeof newLatitude !== "number"
      ) {
        return NextResponse.json(
          {
            error: "Unable to determine city coordinates",
          },
          {
            status: 500,
          },
        );
      }

      updateData.center = [
        newLongitude,
        newLatitude,
      ];
    }

    const result = await db
      .update(cities)
      .set(updateData)
      .where(eq(cities.id, cityId))
      .returning({
        id: cities.id,
        name: cities.name,
        country: cities.country,
        center: cities.center,
        createdAt: cities.createdAt,
        updatedAt: cities.updatedAt,
      });

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: "City not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json(result[0]);
  } catch (error) {
    console.error("Failed to update city:", error);

    return NextResponse.json(
      {
        error: "Failed to update city",
      },
      {
        status: 500,
      },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { id } = await context.params;
    const cityId = Number(id);

    if (!Number.isInteger(cityId) || cityId <= 0) {
      return NextResponse.json(
        {
          error: "Invalid city ID",
        },
        {
          status: 400,
        },
      );
    }

    const result = await db
      .delete(cities)
      .where(eq(cities.id, cityId))
      .returning({
        id: cities.id,
        name: cities.name,
      });

    if (result.length === 0) {
      return NextResponse.json(
        {
          error: "City not found",
        },
        {
          status: 404,
        },
      );
    }

    return NextResponse.json({
      message: "City deleted successfully",
      city: result[0],
    });
  } catch (error) {
    console.error("Failed to delete city:", error);

    return NextResponse.json(
      {
        error: "Failed to delete city",
      },
      {
        status: 500,
      },
    );
  }
}