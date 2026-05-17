import type { AdminSummary, AuditEvent, PlanResponse, TravelRequest, Trip } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_TRAVEL_API_BASE ?? "";
const TOKEN_KEY = "travel_ai_api_token";

function authHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...init?.headers
    }
  });

  if (!response.ok) {
    throw new Error("Travel service request failed");
  }

  return response.json() as Promise<T>;
}

export function checkHealth() {
  return request<{ status: string }>("/health");
}

export function planTrip(payload: TravelRequest) {
  return request<PlanResponse>("/api/travel/agent/plan", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getTrips() {
  return request<Trip[]>("/api/travel/trips");
}

export function saveTrip(payload: TravelRequest) {
  return request<Trip>("/api/travel/trips", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAdminSummary() {
  return request<AdminSummary>("/api/travel/admin/summary");
}

export function getAuditEvents() {
  return request<AuditEvent[]>("/api/travel/admin/audit");
}
