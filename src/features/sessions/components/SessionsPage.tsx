import { connection } from "next/server";
import { getDashboardData } from "../api";
import { SessionsDashboard } from "./SessionsDashboard";

export async function SessionsPage() {
  await connection();
  const dashboardData = await getDashboardData();

  return <SessionsDashboard initialData={dashboardData} />;
}
