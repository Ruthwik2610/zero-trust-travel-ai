import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AdminDashboard, LoginScreen, TravelerDashboard, TripPlannerScreen } from "../TravelAppScreens";

describe("Unipro Travel product screens", () => {
  it("renders the branded login screen", () => {
    render(<LoginScreen />);

    expect(screen.getByText("Smarter Travel. Seamless Experiences.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /Switch to/i })).toBeInTheDocument();
  });

  it("keeps login hero and form on the same integrated auth surface", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toContain(".login-screen::before");
    expect(css).toContain("--auth-panel");
    expect(css).toMatch(/\.login-hero[\s\S]*background:\s*var\(--auth-panel\)/);
    expect(css).toMatch(/\.login-card[\s\S]*background:\s*var\(--auth-panel-strong\)/);
  });

  it("renders the traveler dashboard widgets", () => {
    render(<TravelerDashboard />);

    expect(screen.getByText("Hello, Vikram!")).toBeInTheDocument();
    expect(screen.getByText("Visa Rule Check")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Plan New Trip/i })).toHaveAttribute("href", "/planner");
  });

  it("renders the booking chat and admin dashboard", () => {
    render(<TripPlannerScreen />);
    expect(screen.getByText("Trip Planner")).toBeInTheDocument();
    expect(screen.getByText("Review Itinerary")).toBeInTheDocument();

    render(<AdminDashboard />);
    expect(screen.getByText("Admin User")).toBeInTheDocument();
    expect(screen.getByText("Users & Travelers Overview")).toBeInTheDocument();
  });

  it("does not render mockup screen labels in production views", () => {
    const mockupLabels = /login screen|traveler dashboard|booking chat|admin dashboard/i;

    render(<LoginScreen />);
    expect(screen.queryByText(mockupLabels)).not.toBeInTheDocument();
    cleanup();

    render(<TravelerDashboard />);
    expect(screen.queryByText(mockupLabels)).not.toBeInTheDocument();
    cleanup();

    render(<TripPlannerScreen />);
    expect(screen.queryByText(mockupLabels)).not.toBeInTheDocument();
    cleanup();

    render(<AdminDashboard />);
    expect(screen.queryByText(mockupLabels)).not.toBeInTheDocument();
  });

  it("does not ship demo credentials or dead anchor links", () => {
    render(<LoginScreen />);
    expect(screen.queryByDisplayValue("vikram.r@unipro.com")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("enterprise")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute("placeholder", "name@company.com");
    cleanup();

    [<LoginScreen key="login" />, <TravelerDashboard key="dashboard" />, <TripPlannerScreen key="planner" />, <AdminDashboard key="admin" />].forEach((view) => {
      render(view);
      screen.queryAllByRole("link").forEach((link) => {
        expect(link).not.toHaveAttribute("href", "#");
      });
      cleanup();
    });
  });

  it("keeps the visible itinerary route consistent", () => {
    render(<TripPlannerScreen />);

    expect(screen.getByLabelText("Flight route HYD to JNB and JNB to HYD")).toBeInTheDocument();
    expect(screen.getByLabelText("Hyderabad to Johannesburg")).toBeInTheDocument();
    expect(screen.getByLabelText("Johannesburg to Hyderabad")).toBeInTheDocument();
  });
});
