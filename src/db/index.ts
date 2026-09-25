import "server-only";

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("DATABASE_URL is not defined");
}

const globalForDb = globalThis as unknown as {
    conn: postgres.Sql | undefined;
    queryStats:
        | {
              count: number;
              startedAt: number;
          }
        | undefined;
};

const queryStats =
    globalForDb.queryStats ?? {
        count: 0,
        startedAt: Date.now(),
    };

globalForDb.queryStats = queryStats;

const client =
    globalForDb.conn ??
    postgres(connectionString, {
        debug: (
            _connection,
            query,
            parameters,
        ) => {
            queryStats.count++;
        },
    });

if (process.env.NODE_ENV !== "production") {
    globalForDb.conn = client;
}

export const db = drizzle(client, { schema });