import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminDashboard, LoginScreen, TravelerDashboard, TripPlannerScreen } from "../TravelAppScreens";

describe("Unipro Travel product screens", () => {
  it("renders the branded login screen", () => {
    render(<LoginScreen />);

    expect(screen.getByText("Smarter Travel. Seamless Experiences.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("button", { name: /Switch to/i })).toBeInTheDocument();
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
});
