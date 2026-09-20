export function calculateMapBearing(
    boundary: [number, number][][],
): number {
    const ring = boundary[0];

    if (!ring || ring.length < 4) {
        return 0;
    }

    let bestBearing = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i];
        const [lon2, lat2] = ring[i + 1];

        const phi1 = (lat1 * Math.PI) / 180;
        const phi2 = (lat2 * Math.PI) / 180;
        const deltaLambda =
            ((lon2 - lon1) * Math.PI) / 180;

        const y =
            Math.sin(deltaLambda) *
            Math.cos(phi2);

        const x =
            Math.cos(phi1) * Math.sin(phi2) -
            Math.sin(phi1) *
                Math.cos(phi2) *
                Math.cos(deltaLambda);

        let bearing =
            (Math.atan2(y, x) * 180) /
            Math.PI;

        bearing = (bearing + 360) % 360;

        const distanceToHorizontal = Math.min(
            Math.abs(bearing - 90),
            Math.abs(bearing - 270),
        );

        if (
            distanceToHorizontal <
            bestDistance
        ) {
            bestDistance =
                distanceToHorizontal;
            bestBearing = bearing;
        }
    }

    return (
        (bestBearing - 90 + 360) % 360
    );
}

export type LatLngTuple = [number, number];

export function toLatLng([lon, lat]: [number, number]): LatLngTuple {
    return [lat, lon];
}

export function toLatLngList(coords: [number, number][]): LatLngTuple[] {
    return coords.map(toLatLng);
}

export function toLatLngPolygon(rings: [number, number][][]): LatLngTuple[][] {
    return rings.map(toLatLngList);
}