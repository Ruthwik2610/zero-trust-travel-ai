import json
import os
import sqlite3
from pathlib import Path

from .models import AdminSummary, AuditEvent, Trip
from .security import redact_sensitive_text


def default_db_path() -> Path:
    configured = os.getenv("TRAVEL_AI_DB_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "travel_ai.db"


class TravelStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS trips (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    risk TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    trip_id TEXT,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    def save_trip(self, trip: Trip, events: list[AuditEvent] | None = None) -> Trip:
        payload = trip.model_dump_json()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO trips (id, status, risk, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (trip.id, trip.status, trip.risk, payload, trip.created_at.isoformat()),
            )
            for event in events or []:
                self.save_audit_event(event, conn)
        return trip

    def list_trips(self) -> list[Trip]:
        with self._connect() as conn:
            rows = conn.execute("SELECT payload_json FROM trips ORDER BY created_at DESC").fetchall()
        return [Trip.model_validate_json(row["payload_json"]) for row in rows]

    def save_audit_event(self, event: AuditEvent, conn: sqlite3.Connection | None = None) -> AuditEvent:
        params = (
            event.id,
            event.trip_id,
            event.event_type,
            redact_sensitive_text(event.message),
            event.created_at.isoformat(),
        )
        sql = """
            INSERT OR REPLACE INTO audit_events (id, trip_id, event_type, message, created_at)
            VALUES (?, ?, ?, ?, ?)
        """
        if conn is not None:
            conn.execute(sql, params)
            return event
        with self._connect() as local_conn:
            local_conn.execute(sql, params)
        return event

    def list_audit_events(self) -> list[AuditEvent]:
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM audit_events ORDER BY created_at DESC").fetchall()
        return [
            AuditEvent(
                id=row["id"],
                trip_id=row["trip_id"],
                event_type=row["event_type"],
                message=row["message"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def admin_summary(self) -> AdminSummary:
        trips = self.list_trips()
        events = self.list_audit_events()
        return AdminSummary(
            total_trips=len(trips),
            draft_trips=sum(1 for trip in trips if trip.status == "draft"),
            booked_trips=sum(1 for trip in trips if trip.status == "booked"),
            high_risk_trips=sum(1 for trip in trips if trip.risk == "high"),
            audit_events=len(events),
        )

