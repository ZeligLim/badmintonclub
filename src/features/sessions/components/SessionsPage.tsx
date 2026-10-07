import { connection } from "next/server";
import { getDashboardData } from "../api";
import { createDemoDashboardData } from "../demo-data";
import { SessionsDashboard } from "./SessionsDashboard";
import type { DashboardData } from "../types";

type SessionsPageProps = {
  mode?: DashboardData["mode"];
};

export async function SessionsPage({ mode = "live" }: SessionsPageProps = {}) {
  await connection();
  const dashboardData =
    mode === "demo" ? createDemoDashboardData() : await getDashboardData();

  return <SessionsDashboard initialData={dashboardData} />;
}
