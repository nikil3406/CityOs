import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function firstExisting(candidates) {
    for (const candidate of candidates) {
        try {
            await access(candidate);
            return pathToFileURL(candidate).href;
        } catch {
            // Try the next TypeScript module form.
        }
    }
    return null;
}

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
        const base = path.join(projectRoot, "src", specifier.slice(2));
        const mapped = await firstExisting([`${base}.ts`, `${base}.mts`, path.join(base, "index.ts")]);
        if (mapped) return nextResolve(mapped, context);
    }

    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
        const parentPath = path.dirname(fileURLToPath(context.parentURL));
        const base = path.resolve(parentPath, specifier);
        if (!/\.(?:ts|mts|js|mjs|json)$/.test(specifier)) {
            const mapped = await firstExisting([`${base}.ts`, `${base}.mts`, path.join(base, "index.ts")]);
            if (mapped) return nextResolve(mapped, context);
        }
    }

    return nextResolve(specifier, context);
}
