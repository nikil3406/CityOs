export const SimulationConfig = {
    tickIntervalMs: 3000,
    simulationSecondsPerTick: 1,

    trafficLightStopDistanceMeters: 10,

    defaultVehicleSpeedKmh: 30,

    vehicleFollowing: {
        safeDistanceMeters: 8,
        detectionDistanceMeters: 25,
        minimumSpeedKmh: 0,
    },

    dynamicRerouting: {
        cadenceSeconds: 10,
        maxCalculationsPerInterval: 4,
        retryCooldownSeconds: 30,
        minimumSeconds: 15,
        minimumPercent: 10,
    },
} as const;
