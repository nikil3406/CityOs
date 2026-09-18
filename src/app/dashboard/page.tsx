import CityMapClient from "@/components/map/CityMapClient";

export default function DashboardPage() {
    return (
        <main className="min-h-screen bg-slate-50">
            <header className="border-b bg-white px-8 py-6">
                <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    CityOS
                </h1>

                <p className="mt-1 text-sm text-slate-500">
                    City Operations Dashboard
                </p>
            </header>

            
            <div className="grid min-h-[calc(100vh-81px)] grid-cols-1 gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
                <section className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                    <div className="aspect-square w-full">
                        <CityMapClient />
                    </div>
                </section>

                <aside className="grid grid-rows-[auto_auto_1fr] gap-4">
                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">
                            City Overview
                        </h2>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Roads
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    14
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Intersections
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    9
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Buildings
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    —
                                </p>
                            </div>

                            <div className="rounded-lg bg-slate-50 p-4">
                                <p className="text-sm text-slate-500">
                                    Trees
                                </p>

                                <p className="mt-1 text-2xl font-semibold">
                                    —
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">
                            Traffic Status
                        </h2>

                        <div className="mt-4 flex items-center gap-3 rounded-lg bg-slate-50 p-4">
                            <div className="h-3 w-3 rounded-full bg-green-500" />

                            <div>
                                <p className="font-medium">
                                    Simulation inactive
                                </p>

                                <p className="text-sm text-slate-500">
                                    Traffic simulation will be
                                    available in Phase 3.
                                </p>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-xl border bg-white p-5 shadow-sm">
                        <h2 className="text-lg font-semibold">
                            City Infrastructure
                        </h2>

                        <div className="mt-4 space-y-3">
                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-slate-600">
                                    Buildings
                                </span>

                                <span className="text-sm font-medium">
                                    Dataset layer
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-slate-600">
                                    Trees
                                </span>

                                <span className="text-sm font-medium">
                                    Dataset layer
                                </span>
                            </div>

                            <div className="flex items-center justify-between border-b pb-3">
                                <span className="text-sm text-slate-600">
                                    Waterways
                                </span>

                                <span className="text-sm font-medium">
                                    Dataset layer
                                </span>
                            </div>

                            <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600">
                                    Contours
                                </span>

                                <span className="text-sm font-medium">
                                    Dataset layer
                                </span>
                            </div>
                        </div>
                    </section>
                </aside>
            </div>
        </main>
    );
}