import json
import os
import sqlite3
from collections import Counter
from pathlib import Path

from .models import (
    AdminSummary,
    AuditEvent,
    CorporateAdminSummary,
    CorporateTravelRequest,
    EmailEvent,
    PolicyActivityEvent,
    PolicyGroup,
    PolicyRevision,
    TravelerBudgetUsage,
    TravelerProfile,
    Trip,
)
from .security import SensitiveFieldCipher, pseudonymous_ref, redact_sensitive_text


def default_db_path() -> Path:
    configured = os.getenv("TRAVEL_AI_DB_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2] / "data" / "travel_ai.db"


class TravelStore:
    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = db_path or default_db_path()
        self.cipher = SensitiveFieldCipher()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS trips (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL DEFAULT '',
                    owner_department TEXT NOT NULL DEFAULT 'general',
                    status TEXT NOT NULL,
                    risk TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    sensitive_payload_json TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                )
                """)
            self._ensure_column(conn, "trips", "owner_id", "TEXT NOT NULL DEFAULT ''")
            self._ensure_column(
                conn, "trips", "owner_department", "TEXT NOT NULL DEFAULT 'general'"
            )
            self._ensure_column(
                conn, "trips", "sensitive_payload_json", "TEXT NOT NULL DEFAULT ''"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS audit_events (
                    id TEXT PRIMARY KEY,
                    trip_id TEXT,
                    actor_id TEXT,
                    event_type TEXT NOT NULL,
                    message TEXT NOT NULL,
                    purpose TEXT,
                    decision TEXT NOT NULL DEFAULT 'record',
                    created_at TEXT NOT NULL
                )
                """)
            self._ensure_column(conn, "audit_events", "actor_id", "TEXT")
            self._ensure_column(conn, "audit_events", "purpose", "TEXT")
            self._ensure_column(
                conn, "audit_events", "decision", "TEXT NOT NULL DEFAULT 'record'"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS corporate_requests (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL DEFAULT '',
                    owner_department TEXT NOT NULL DEFAULT 'general',
                    status TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS corporate_reference_data (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS travelers (
                    id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS policy_groups (
                    id TEXT PRIMARY KEY,
                    payload_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS policy_activity_events (
                    id TEXT PRIMARY KEY,
                    policy_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS email_events (
                    id TEXT PRIMARY KEY,
                    request_id TEXT,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """)

            # Performance Optimization: Add indexes on frequently queried fields
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_trips_owner_id ON trips(owner_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_corporate_requests_owner_id ON corporate_requests(owner_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_corporate_reference_data_kind ON corporate_reference_data(kind)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_policy_activity_events_policy_id ON policy_activity_events(policy_id)"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_email_events_request_id ON email_events(request_id)"
            )

    def _ensure_column(
        self, conn: sqlite3.Connection, table: str, column: str, definition: str
    ) -> None:
        columns = {
            row["name"]
            for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
        }
        if column not in columns:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def save_trip(self, trip: Trip, events: list[AuditEvent] | None = None) -> Trip:
        public_trip = trip.model_copy(update={"sensitive_context": {}})
        payload = public_trip.model_dump_json()
        sensitive_payload = self.cipher.encrypt_json(trip.sensitive_context)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO trips (
                    id, owner_id, owner_department, status, risk, payload_json, sensitive_payload_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    trip.id,
                    trip.owner_id,
                    trip.owner_department,
                    trip.status,
                    trip.risk,
                    payload,
                    sensitive_payload,
                    trip.created_at.isoformat(),
                ),
            )
            for event in events or []:
                self.save_audit_event(event, conn)
        return trip

    def list_trips(self) -> list[Trip]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM trips ORDER BY created_at DESC"
            ).fetchall()
        return [Trip.model_validate_json(row["payload_json"]) for row in rows]

    def list_trips_for_owner(self, owner_id: str) -> list[Trip]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM trips WHERE owner_id = ? ORDER BY created_at DESC",
                (owner_id,),
            ).fetchall()
        return [Trip.model_validate_json(row["payload_json"]) for row in rows]

    def save_audit_event(
        self, event: AuditEvent, conn: sqlite3.Connection | None = None
    ) -> AuditEvent:
        params = (
            event.id,
            event.trip_id,
            event.actor_id,
            event.event_type,
            redact_sensitive_text(event.message),
            redact_sensitive_text(event.purpose or "") or None,
            event.decision,
            event.created_at.isoformat(),
        )
        sql = """
            INSERT OR REPLACE INTO audit_events (id, trip_id, actor_id, event_type, message, purpose, decision, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        if conn is not None:
            conn.execute(sql, params)
            return event
        with self._connect() as local_conn:
            local_conn.execute(sql, params)
        return event

    def list_audit_events(self) -> list[AuditEvent]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM audit_events ORDER BY created_at DESC"
            ).fetchall()
        return [
            AuditEvent(
                id=row["id"],
                trip_id=row["trip_id"],
                actor_id=row["actor_id"],
                event_type=row["event_type"],
                message=row["message"],
                purpose=row["purpose"],
                decision=row["decision"],
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def admin_summary(self) -> AdminSummary:
        trips = self.list_trips()
        total_spend = 0
        usage: dict[str, dict[str, int | str]] = {}
        for trip in trips:
            spend = sum(
                offer.price_usd for offer in trip.flight_offers + trip.hotel_offers
            )
            total_spend += spend
            ref = pseudonymous_ref(trip.owner_id or trip.id)
            row = usage.setdefault(
                ref,
                {
                    "traveler_ref": ref,
                    "department": trip.owner_department or "general",
                    "trip_count": 0,
                    "spend_usd": 0,
                    "policy_flags": 0,
                },
            )
            row["trip_count"] = int(row["trip_count"]) + 1
            row["spend_usd"] = int(row["spend_usd"]) + spend
            row["policy_flags"] = int(row["policy_flags"]) + (
                1 if trip.risk in {"medium", "high"} else 0
            )
        return AdminSummary(
            total_trips=len(trips),
            draft_trips=sum(1 for trip in trips if trip.status == "draft"),
            booked_trips=sum(1 for trip in trips if trip.status == "booked"),
            high_risk_trips=sum(1 for trip in trips if trip.risk == "high"),
            audit_events=0,
            budget_utilization_usd=total_spend,
            visa_expiring_soon=0,
            policy_updates_due=1,
            budget_by_traveler=[
                TravelerBudgetUsage(
                    traveler_ref=str(row["traveler_ref"]),
                    department=str(row["department"]),
                    trip_count=int(row["trip_count"]),
                    spend_usd=int(row["spend_usd"]),
                    policy_flags=int(row["policy_flags"]),
                )
                for row in usage.values()
            ],
        )

    def save_corporate_request(
        self, request: CorporateTravelRequest
    ) -> CorporateTravelRequest:
        payload = request.model_dump_json()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO corporate_requests (
                    id, owner_id, owner_department, status, payload_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request.id,
                    request.owner_id,
                    request.owner_department,
                    request.status,
                    payload,
                    request.created_at.isoformat(),
                    request.updated_at.isoformat(),
                ),
            )
        return request

    def get_corporate_request(self, request_id: str) -> CorporateTravelRequest | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM corporate_requests WHERE id = ?",
                (request_id,),
            ).fetchone()
        if row is None:
            return None
        return CorporateTravelRequest.model_validate_json(row["payload_json"])

    def delete_corporate_request(self, request_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute(
                "DELETE FROM corporate_requests WHERE id = ?", (request_id,)
            )
        return cursor.rowcount > 0

    def list_corporate_requests(self) -> list[CorporateTravelRequest]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM corporate_requests ORDER BY created_at DESC"
            ).fetchall()
        return [
            CorporateTravelRequest.model_validate_json(row["payload_json"])
            for row in rows
        ]

    def list_corporate_requests_for_owner(
        self, owner_id: str
    ) -> list[CorporateTravelRequest]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM corporate_requests WHERE owner_id = ? ORDER BY created_at DESC",
                (owner_id,),
            ).fetchall()
        return [
            CorporateTravelRequest.model_validate_json(row["payload_json"])
            for row in rows
        ]

    def save_reference_rows(self, kind: str, rows: list[dict[str, object]]) -> int:
        if not rows:
            return 0
        with self._connect() as conn:
            for row in rows:
                conn.execute(
                    "INSERT INTO corporate_reference_data (kind, payload_json) VALUES (?, ?)",
                    (
                        kind,
                        json.dumps(
                            row, separators=(",", ":"), sort_keys=True, default=str
                        ),
                    ),
                )
        return len(rows)

    def list_reference_rows(self, kind: str) -> list[dict[str, object]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM corporate_reference_data WHERE kind = ? ORDER BY id ASC",
                (kind,),
            ).fetchall()
        parsed: list[dict[str, object]] = []
        for row in rows:
            payload = json.loads(row["payload_json"])
            if isinstance(payload, dict):
                parsed.append(payload)
        return parsed

    def corporate_admin_summary(self) -> CorporateAdminSummary:
        requests = self.list_corporate_requests()
        statuses = [
            "New",
            "New Entries",
            "Missing Info",
            "Pending Details",
            "Processing",
            "Ready for Planning",
            "Plan Generated",
            "Waiting for Approval",
            "Finalized",
            "Completed",
            "Cancelled",
        ]
        by_status = {status: 0 for status in statuses}
        approval_required = 0
        visa_issues = 0
        finalized_requests: list[CorporateTravelRequest] = []
        destinations: Counter[str] = Counter()
        for request in requests:
            by_status[request.status] = by_status.get(request.status, 0) + 1
            if request.travel_details.destination:
                destinations[request.travel_details.destination] += 1
            active_request = request.status not in {
                "Finalized",
                "Completed",
                "Cancelled",
            }
            if (
                active_request
                and request.generated_plan
                and request.generated_plan.budget_policy_check.approval_required
            ):
                approval_required += 1
            if (
                active_request
                and request.generated_plan
                and request.generated_plan.travel_readiness.visa_status
                in {"Blocking Issue", "Needs Review"}
            ):
                visa_issues += 1
            if request.status in {"Finalized", "Completed"}:
                finalized_requests.append(request)
        handling_hours = [
            max(0.0, (request.updated_at - request.created_at).total_seconds() / 3600)
            for request in finalized_requests
        ]
        return CorporateAdminSummary(
            total_requests=len(requests),
            by_status=by_status,
            approval_required=approval_required,
            finalized=by_status["Finalized"] + by_status["Completed"],
            missing_info=by_status["Missing Info"] + by_status["Pending Details"],
            visa_issues=visa_issues,
            average_handling_time_hours=(
                round(sum(handling_hours) / len(handling_hours), 2)
                if handling_hours
                else 0
            ),
            common_destinations=[
                {"destination": destination, "count": count}
                for destination, count in destinations.most_common(5)
            ],
        )

    def save_traveler(self, traveler: TravelerProfile) -> TravelerProfile:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO travelers (id, payload_json, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    traveler.id,
                    traveler.model_dump_json(),
                    traveler.created_at.isoformat(),
                    traveler.updated_at.isoformat(),
                ),
            )
        return traveler

    def get_traveler(self, traveler_id: str) -> TravelerProfile | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM travelers WHERE id = ?", (traveler_id,)
            ).fetchone()
        return TravelerProfile.model_validate_json(row["payload_json"]) if row else None

    def list_travelers(self) -> list[TravelerProfile]:
        self._seed_travelers_from_requests()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM travelers ORDER BY updated_at DESC"
            ).fetchall()
        return [
            TravelerProfile.model_validate_json(row["payload_json"]) for row in rows
        ]

    def _seed_travelers_from_requests(self) -> None:
        existing = self._list_travelers_without_seed()
        existing_emails = {traveler.email.lower() for traveler in existing}
        requests = self.list_corporate_requests()
        if not existing and not requests:
            self.save_traveler(
                TravelerProfile(
                    id="traveler_elena_vance",
                    name="Elena Vance",
                    email="elena.vance@example.com",
                    company="Lumon Industries",
                    department="Strategy & Operations",
                    vip_level="VIP Platinum",
                    status="Compliant",
                    location="New York, NY",
                    seat_preference="Aisle",
                    meal_preference="Gluten Free",
                    hotel_preference="Preferred corporate hotels near office",
                    policy_notes=[
                        "Business class permitted for international flights over 6 hours."
                    ],
                    loyalty_programs=[
                        {
                            "provider": "Delta SkyMiles",
                            "tier": "Diamond Medallion",
                            "account_ref": "On file",
                        },
                        {
                            "provider": "Marriott Bonvoy",
                            "tier": "Ambassador Elite",
                            "account_ref": "On file",
                        },
                    ],
                    documents=[
                        {
                            "document_type": "passport",
                            "label": "Passport",
                            "status": "Ready",
                            "redacted_value": "On file",
                        },
                        {
                            "document_type": "known_traveler",
                            "label": "Known Traveler Number",
                            "status": "Ready",
                            "redacted_value": "On file",
                        },
                    ],
                    recent_trips=["San Francisco, USA", "London, UK", "New York, USA"],
                )
            )
            return
        for request in requests:
            email = (request.traveller_details.traveler_email or "").strip().lower()
            if not email or email in existing_emails:
                continue
            document_status = "Ready"
            traveler_status = "Compliant"
            if (
                not request.traveller_details.passport_number
                and not request.traveller_details.passport_expiry
            ):
                document_status = "Missing"
                traveler_status = "Missing Passport"
            elif request.traveller_details.passport_expiry:
                document_status = "Ready"
            traveler = TravelerProfile(
                name=request.traveller_details.traveler_name or "Traveller pending",
                email=email,
                company=request.company_details.company_name or "Company pending",
                department=request.traveller_details.department,
                vip_level=request.company_details.policy_tier,
                status=traveler_status,  # type: ignore[arg-type]
                seat_preference=request.preferences.seat_preference,
                meal_preference=request.preferences.meal_preference,
                hotel_preference=request.preferences.hotel_preference,
                policy_notes=(
                    [request.budgets.policy_notes]
                    if request.budgets.policy_notes
                    else []
                ),
                loyalty_programs=[],
                documents=[
                    {
                        "document_type": "passport",
                        "label": "Passport",
                        "status": document_status,
                        "expires_at": request.traveller_details.passport_expiry,
                        "redacted_value": (
                            "On file"
                            if request.traveller_details.passport_number
                            else None
                        ),
                    }
                ],
                recent_trips=[
                    f"{request.travel_details.origin or 'Origin'} to {request.travel_details.destination or 'Destination'}"
                ],
                created_at=request.created_at,
                updated_at=request.updated_at,
            )
            self.save_traveler(traveler)
            existing_emails.add(email)

    def _list_travelers_without_seed(self) -> list[TravelerProfile]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM travelers ORDER BY updated_at DESC"
            ).fetchall()
        return [
            TravelerProfile.model_validate_json(row["payload_json"]) for row in rows
        ]

    def save_policy_group(self, policy: PolicyGroup) -> PolicyGroup:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO policy_groups (id, payload_json, updated_at)
                VALUES (?, ?, ?)
                """,
                (policy.id, policy.model_dump_json(), policy.updated_at.isoformat()),
            )
        return policy

    def get_policy_group(self, policy_id: str) -> PolicyGroup | None:
        self._seed_policy_groups()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload_json FROM policy_groups WHERE id = ?", (policy_id,)
            ).fetchone()
        return PolicyGroup.model_validate_json(row["payload_json"]) if row else None

    def list_policy_groups(self) -> list[PolicyGroup]:
        self._seed_policy_groups()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT payload_json FROM policy_groups ORDER BY updated_at DESC"
            ).fetchall()
        return [PolicyGroup.model_validate_json(row["payload_json"]) for row in rows]

    def save_policy_activity(self, event: PolicyActivityEvent) -> PolicyActivityEvent:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO policy_activity_events (id, policy_id, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    event.id,
                    event.policy_id,
                    event.model_dump_json(),
                    event.created_at.isoformat(),
                ),
            )
        return event

    def list_policy_activity(
        self, policy_id: str | None = None
    ) -> list[PolicyActivityEvent]:
        self._seed_policy_groups()
        with self._connect() as conn:
            if policy_id:
                rows = conn.execute(
                    "SELECT payload_json FROM policy_activity_events WHERE policy_id = ? ORDER BY created_at DESC",
                    (policy_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM policy_activity_events ORDER BY created_at DESC"
                ).fetchall()
        return [
            PolicyActivityEvent.model_validate_json(row["payload_json"]) for row in rows
        ]

    def save_policy_revision(
        self, policy_id: str, revision: PolicyRevision, actor: str, activity: str
    ) -> PolicyGroup | None:
        policy = self.get_policy_group(policy_id)
        if policy is None:
            return None
        revisions = [
            revision if existing.id == revision.id else existing
            for existing in policy.revisions
        ]
        updated = policy.model_copy(
            update={"revisions": revisions, "updated_at": revision.updated_at}
        )
        self.save_policy_group(updated)
        self.save_policy_activity(
            PolicyActivityEvent(
                policy_id=policy_id, actor=actor, activity=activity, status="SUCCESS"
            )
        )
        return updated

    def save_email_event(self, event: EmailEvent) -> EmailEvent:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO email_events (id, request_id, payload_json, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    event.id,
                    event.request_id,
                    event.model_dump_json(),
                    event.created_at.isoformat(),
                ),
            )
        return event

    def list_email_events(self, request_id: str | None = None) -> list[EmailEvent]:
        with self._connect() as conn:
            if request_id:
                rows = conn.execute(
                    "SELECT payload_json FROM email_events WHERE request_id = ? ORDER BY created_at DESC",
                    (request_id,),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT payload_json FROM email_events ORDER BY created_at DESC"
                ).fetchall()
        return [EmailEvent.model_validate_json(row["payload_json"]) for row in rows]

    def _seed_policy_groups(self) -> None:
        with self._connect() as conn:
            count = conn.execute(
                "SELECT COUNT(*) AS count FROM policy_groups"
            ).fetchone()["count"]
        if count:
            return
        policy = PolicyGroup(
            id="policy_global_travel_2024",
            client_name="Global Travel Policy 2024",
            business_unit="Corporate",
            status="Active",
            compliance_score=98.4,
            active_rules=[
                {
                    "label": "Flight Class",
                    "value": "Business class allowed for international flights over 6 hours.",
                },
                {
                    "label": "Lodging Cap",
                    "value": "Flag stays above the configured nightly cap before booking.",
                },
                {
                    "label": "Exceptions",
                    "value": "Record external approval for bookings more than 25% above cap.",
                },
            ],
            revisions=[
                {
                    "id": "policy_rev_global_v24",
                    "version": "v2.4.0",
                    "status": "In Review",
                    "summary": "Update per-diems for APAC and adjust director business-class threshold.",
                    "proposed_rules": [
                        {
                            "label": "Singapore Per Diem",
                            "value": "$115 USD",
                            "status": "Changed",
                        },
                        {
                            "label": "Flight Class",
                            "value": "Director business class threshold reduced to 6 hours.",
                            "status": "Changed",
                        },
                    ],
                    "impact_analysis": "Projected annual travel spend increase is approximately 8.4% based on historical long-haul trips.",
                    "reviewer_comments": ["Finance review pending."],
                    "created_by": "AI Extraction",
                }
            ],
        )
        self.save_policy_group(policy)
        self.save_policy_activity(
            PolicyActivityEvent(
                policy_id=policy.id,
                actor="System",
                activity="Seeded active travel policy and current review revision.",
                status="SUCCESS",
            )
        )
