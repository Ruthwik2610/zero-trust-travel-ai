from __future__ import annotations

import html
from pathlib import Path

from PIL import Image as PillowImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
DOCS_DIR = ROOT / "docs"
ASSET_DIR = DOCS_DIR / "assets" / "workflow-guide"
PDF_PATH = DOCS_DIR / "Travel_AI_Current_Workflows_Developer_Guide.pdf"
MD_PATH = DOCS_DIR / "Travel_AI_Current_Workflows_Developer_Guide.md"

PAGE_WIDTH, PAGE_HEIGHT = letter
CONTENT_WIDTH = 7.25 * inch

NAVY = colors.HexColor("#12213a")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#526173")
TEAL = colors.HexColor("#00796b")
BLUE = colors.HexColor("#2563eb")
CORAL = colors.HexColor("#e76f51")
LINE = colors.HexColor("#d7e0e8")
SURFACE = colors.HexColor("#f5f7fb")
PALE_TEAL = colors.HexColor("#e6f5f1")
PALE_BLUE = colors.HexColor("#eaf1ff")
PALE_CORAL = colors.HexColor("#fff0ea")
PALE_YELLOW = colors.HexColor("#fff7d6")


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=27,
        leading=32,
        alignment=TA_CENTER,
        textColor=NAVY,
        spaceAfter=12,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=11.5,
        leading=17,
        alignment=TA_CENTER,
        textColor=MUTED,
        spaceAfter=14,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=17,
        leading=21,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="SubTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.2,
        leading=15,
        textColor=INK,
        spaceBefore=7,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.8,
        leading=12.3,
        textColor=INK,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.5,
        leading=10.2,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.4,
        leading=9.2,
        textColor=colors.white,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.2,
        leading=9.3,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCellBold",
        parent=styles["TableCell"],
        fontName="Helvetica-Bold",
        textColor=NAVY,
    )
)
styles.add(
    ParagraphStyle(
        name="GuideCode",
        parent=styles["Code"],
        fontName="Courier",
        fontSize=7.2,
        leading=9.5,
        textColor=colors.HexColor("#1f2937"),
    )
)


def p(text: str, style: str = "Body") -> Paragraph:
    return Paragraph(html.escape(text), styles[style])


def raw_p(text: str, style: str = "Body") -> Paragraph:
    return Paragraph(text, styles[style])


def subtitle(text: str) -> list:
    return [p(text, "SubTitle")]


def bullets(items: list[str]) -> ListFlowable:
    return ListFlowable(
        [ListItem(p(item, "Body"), leftIndent=8) for item in items],
        bulletType="bullet",
        leftIndent=13,
        bulletFontSize=5,
        bulletColor=TEAL,
    )


def code_block(text: str) -> Table:
    block = Preformatted(text, styles["GuideCode"])
    table = Table([[block]], colWidths=[CONTENT_WIDTH])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f3f7")),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def data_table(rows: list[list[object]], widths: list[float], *, header_color=NAVY, zebra=True) -> Table:
    converted: list[list[object]] = []
    for row_index, row in enumerate(rows):
        converted_row: list[object] = []
        for value in row:
            if isinstance(value, str):
                style = "TableHead" if row_index == 0 else "TableCell"
                converted_row.append(p(value, style))
            else:
                converted_row.append(value)
        converted.append(converted_row)
    table = Table(converted, colWidths=widths, repeatRows=1, hAlign="LEFT")
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), header_color),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if zebra:
        for row_index in range(1, len(rows)):
            if row_index % 2 == 0:
                commands.append(("BACKGROUND", (0, row_index), (-1, row_index), colors.HexColor("#fbfcfe")))
    table.setStyle(TableStyle(commands))
    return table


def callout(title: str, body: str, tint=PALE_TEAL) -> Table:
    table = Table(
        [[p(title, "TableCellBold")], [p(body, "Small")]],
        colWidths=[CONTENT_WIDTH],
        hAlign="LEFT",
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), tint),
                ("BOX", (0, 0), (-1, -1), 0.45, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def flow_row(title: str, steps: list[str]) -> list:
    cells: list[object] = []
    widths: list[float] = []
    arrow_width = 0.2 * inch
    box_width = (CONTENT_WIDTH - arrow_width * (len(steps) - 1)) / len(steps)
    for index, step in enumerate(steps):
        cells.append(p(step, "TableCellBold"))
        widths.append(box_width)
        if index < len(steps) - 1:
            cells.append(p(">", "TableCellBold"))
            widths.append(arrow_width)
    table = Table([cells], colWidths=widths, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), PALE_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )
    return [p(title, "SubTitle"), table, Spacer(1, 6)]


def sequence_table(title: str, rows: list[list[str]]) -> list:
    table_rows = [["Step", "Sequence", "Technical behavior", "Plain English"]] + rows
    widths = [0.36 * inch, 1.4 * inch, 3.0 * inch, 2.49 * inch]
    return [p(title, "SubTitle"), data_table(table_rows, widths, header_color=TEAL), Spacer(1, 7)]


def fit_image(filename: str, max_width: float = CONTENT_WIDTH, max_height: float = 3.75 * inch) -> Image | Spacer:
    path = ASSET_DIR / filename
    if not path.exists():
        return Spacer(1, 12)
    with PillowImage.open(path) as img:
        width, height = img.size
    scale = min(max_width / width, max_height / height)
    image = Image(str(path), width=width * scale, height=height * scale)
    image.hAlign = "CENTER"
    return image


def screenshot_block(title: str, filename: str, caption: str) -> list:
    return [
        p(title, "SubTitle"),
        fit_image(filename),
        p(caption, "Small"),
        Spacer(1, 8),
    ]


def header_footer(canvas, doc) -> None:
    canvas.saveState()
    page = canvas.getPageNumber()
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(doc.leftMargin, PAGE_HEIGHT - 0.43 * inch, "Travel AI Current Workflows Developer Guide")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, PAGE_HEIGHT - 0.43 * inch, f"Page {page}")
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, PAGE_HEIGHT - 0.56 * inch, PAGE_WIDTH - doc.rightMargin, PAGE_HEIGHT - 0.56 * inch)
    canvas.restoreState()


def cover_page(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f4f7fb"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, PAGE_HEIGHT - 1.0 * inch, PAGE_WIDTH, 1.0 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(doc.leftMargin, PAGE_HEIGHT - 0.55 * inch, "UNIPRO TRAVEL AI")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - doc.rightMargin, PAGE_HEIGHT - 0.55 * inch, "Technical workflow guide")
    canvas.restoreState()


def add_section(story: list, title: str) -> None:
    story.append(p(title, "SectionTitle"))


def build_story() -> list:
    story: list = []
    story.extend(
        [
            Spacer(1, 0.6 * inch),
            p("Travel AI Current Workflows", "CoverTitle"),
            p("Developer Guide: technical sequence diagrams with plain-English explanations", "CoverSubtitle"),
            callout(
                "Scope of this document",
                "Generated from the local standalone travel-ai codebase on 2026-05-25. It documents implemented workflows in backend/app, frontend/src, tests, and current repo docs. It does not claim live GDS ticketing, SignalR streaming, WhatsApp intake, or production SSO because those are not implemented in this codebase.",
                PALE_BLUE,
            ),
            Spacer(1, 0.15 * inch),
            data_table(
                [
                    ["Area", "Current reality"],
                    ["Product shape", "Agent-owned corporate travel operations workspace, not a booking engine."],
                    ["Backend", "FastAPI service with SQLite persistence, scoped bearer tokens, audit events, provider search, PDF/XLSX generation, email events, and privacy gateway."],
                    ["Frontend", "Next.js command center with login, queue, guided request workspace, traveler roster, policy context, audit archive, and export actions."],
                    ["AI use", "Deterministic rules decide policy, budget, document readiness, and finalization gates. External LLM only improves narrative drafts after POPIA tokenization."],
                    ["Booking status", "Provider search informs options. No ticketing, GDS order creation, payment, or final booking confirmation is performed."],
                ],
                [1.45 * inch, 5.8 * inch],
            ),
        ]
    )
    story.append(PageBreak())

    add_section(story, "1. Executive Mental Model")
    story.append(
        p(
            "Travel AI is easiest to understand as a request-to-itinerary operations pipeline. The system accepts a corporate travel request, normalizes it into typed Pydantic models, enriches it with stored company/traveler/policy context, generates three reviewed itinerary options, records approval state, and produces final itinerary artifacts. The app intentionally stops before booking/ticketing."
        )
    )
    story.extend(
        flow_row(
            "Main lifecycle flow",
            ["Intake", "Validate", "Plan", "Review", "Approve", "Finalize", "Export"],
        )
    )
    story.append(
        data_table(
            [
                ["Concept", "Technical meaning", "Plain English"],
                ["CorporateTravelRequest", "The persistent request row stored as JSON in corporate_requests.", "One travel job the agent is handling."],
                ["CorporateTravelPlan", "A generated plan containing readiness, budget policy check, options, offers, and drafts.", "The AI-assisted recommendation pack."],
                ["TravelOption", "Exactly three options: budget, fastest, comfort.", "The choices shown to a client or agent."],
                ["AuditEvent", "Append-only security/operations record with purpose and allow/deny decision.", "The receipt trail for who did what and why."],
                ["EmailEvent", "Resend send/webhook/inbound metadata stored in email_events.", "The delivery and reply evidence trail."],
                ["Privacy token map", "Temporary mapping from PII tokens back to raw values inside the backend process.", "A privacy vault used only around external AI calls."],
            ],
            [1.5 * inch, 3.0 * inch, 2.75 * inch],
        )
    )
    story.append(Spacer(1, 8))
    story.append(callout("Developer rule of thumb", "If a path can affect budget, visa/passport status, approval state, final itinerary, or customer-facing text, look for both a backend test and an audit event. Those are the best proof that the workflow is implemented.", PALE_TEAL))

    add_section(story, "2. What Is Implemented Versus The PRD")
    story.append(
        data_table(
            [
                ["PRD area", "Current implementation", "Gap or caveat"],
                ["Corporate portals / email / forms", "Manual create, PDF/Excel upload, and Resend inbound email webhook exist.", "WhatsApp structured forms and corporate portal listener are not implemented."],
                ["Field extraction", "Excel sheet parsing, simple PDF/text extraction, and typed Pydantic validation exist.", "No strict IATA database validation yet; airport strings are accepted as business text."],
                ["Itinerary options", "Backend generates exactly three options: Best within budget, Fastest route, Comfort-focused option.", "PRD asked for 4 to 5 options. Current model enforces 3."],
                ["AI personalization", "Policy rows, traveler history rows, visa rows, preferences, and provider offers influence the plan.", "Ranking is deterministic plus narrative LLM enhancement, not a learned recommender."],
                ["POPIA anonymization", "Implemented for external corporate LLM payloads with tokenization, leak guard, rehydration, and tests.", "No network proxy appliance yet; it is an application-layer privacy gateway."],
                ["Self-service executive URL", "Demo login and agent/admin routes exist.", "Executive SSO/PA role is not implemented."],
                ["Live provider inventory", "Duffel, Booking.com Demand API, RapidAPI Booking, MCP tools, and synthetic fallback are wired for search.", "Search only. No order creation, payment, ticketing, or GDS issue."],
                ["Streaming inventory", "Standard HTTP request/response.", "No SignalR or async inventory streaming UI."],
                ["Email ledger", "Resend email events and webhooks are persisted.", "PRD said SendGrid; code uses Resend."],
                ["Emergency modifications", "Critical issue/recovery mode and finalization gates exist.", "GDS fare rules, penalties, cancellation/amend ticketing are not implemented."],
            ],
            [1.35 * inch, 3.0 * inch, 2.9 * inch],
            header_color=CORAL,
        )
    )
    story.append(PageBreak())

    add_section(story, "3. Visual Surface Map")
    story.extend(
        screenshot_block(
            "Login",
            "01-login.png",
            "The first screen is agent-focused. It uses demo credentials and routes the signed-in agent to /dashboard.",
        )
    )
    story.extend(
        screenshot_block(
            "Agent dashboard and request queue",
            "02-agent-dashboard.png",
            "The queue is the operational control point. Counts, filters, critical-issue actions, and request opening all originate here.",
        )
    )
    story.extend(
        screenshot_block(
            "Guided request workspace",
            "03-request-workspace-missing-info.png",
            "The request workspace is a stepper, not a chat-only screen. Missing info, flights, hotel, itinerary, and approval/export are treated as stateful workflow steps.",
        )
    )
    story.extend(
        screenshot_block(
            "Flight option step",
            "04-request-workspace-flights.png",
            "Flight cards are generated from live provider offers when available, otherwise from synthetic planning offers. Selection is saved back through the request update API.",
        )
    )
    story.extend(
        screenshot_block(
            "Traveler roster",
            "05-traveler-roster.png",
            "Roster review is agent-owned in the current MVP. Registration/profile update cards are reviewed before long-term traveler data changes.",
        )
    )
    story.extend(
        screenshot_block(
            "Policy context",
            "06-policy-center.png",
            "Policy pages expose uploaded or seeded policy groups and revision workflows. Planning consumes policy rows as background context.",
        )
    )
    story.extend(
        screenshot_block(
            "Audit archive",
            "07-audit-archive.png",
            "Audit and email event views show pipeline, approval, delivery, and deny records without raw secrets or unmasked document values.",
        )
    )
    story.append(PageBreak())

    add_section(story, "4. Architecture And Data Boundaries")
    story.extend(
        flow_row(
            "System architecture flow",
            ["Next UI", "api.ts", "FastAPI", "Security", "Store", "Providers"],
        )
    )
    story.append(
        data_table(
            [
                ["Layer", "Primary files", "Responsibility", "Failure behavior"],
                ["Frontend shell", "frontend/src/components/TravelAppScreens.tsx", "Login, queue, guided workspace, roster, policy, audit, exports.", "Shows safe retry/status messages. Does not display raw backend errors."],
                ["API client", "frontend/src/lib/api.ts", "Maps frontend field names to backend models and attaches Authorization plus X-Travel-Purpose.", "Throws generic Travel service request failed on non-OK responses."],
                ["API gateway", "backend/app/main.py", "Routes, auth dependencies, audit decisions, imports, exports, mail webhooks.", "Returns safe HTTP errors; deny events are audited."],
                ["Planning engine", "backend/app/agent.py", "Provider search, deterministic planning, policy/budget/readiness, LLM narrative enhancement.", "Provider gaps create notes and synthetic planning options; LLM failure logs internally and falls back."],
                ["Privacy gateway", "backend/app/privacy_gateway.py", "Tokenizes PII before external LLM calls and blocks leaked raw PII.", "Raises PrivacyGatewayError before outbound AI if leak detected."],
                ["Persistence", "backend/app/store.py", "SQLite tables for trips, audit events, requests, reference data, travelers, policies, email events.", "Schema is initialized lazily; sensitive trip payloads use Fernet encryption."],
                ["Mail", "backend/app/mailer.py", "Resend outbound email, attachment payloads, safe body copy.", "Configuration_required or failed EmailEvent instead of crashing user workflow."],
                ["Internal logging", "backend/app/internal_logger.py", "Sanitized structured logs for degraded internal paths.", "PII/secrets are redacted before server log emission."],
            ],
            [1.15 * inch, 1.75 * inch, 2.8 * inch, 1.55 * inch],
        )
    )
    story.append(Spacer(1, 7))
    story.append(code_block(
        "Request boundary rule:\n"
        "Browser -> api.ts -> FastAPI route -> require_auth -> protected_purpose -> ensure_scope -> domain function -> store/audit/event\n\n"
        "External AI boundary rule:\n"
        "Domain payload -> anonymize_for_external_ai -> assert_no_raw_pii -> LLM -> rehydrate_from_vault -> deterministic fields restored from base plan"
    ))

    add_section(story, "5. Auth, Purpose, Scope, And Audit Workflow")
    story.append(p("Every meaningful backend endpoint is protected by three checks: a bearer token, a purpose header, and a required scope. The purpose is not decorative; it is stored in audit events so later review can answer why access happened."))
    story.extend(
        sequence_table(
            "Sequence diagram: demo login and scoped API call",
            [
                ["1", "Browser -> /api/auth/demo-login", "POST username/password; backend resolves demo identity in security.py.", "The user signs in as agent or admin."],
                ["2", "main.py -> security.py", "create_access_token returns bearer token plus AuthContext with scopes and expiry.", "The app receives a short-lived badge saying what the user may do."],
                ["3", "api.ts -> localStorage", "storeAuthSession persists token and auth context in browser storage.", "The UI remembers the session for later calls."],
                ["4", "api.ts -> FastAPI", "Every request attaches Authorization and X-Travel-Purpose.", "The app says both who is acting and why."],
                ["5", "FastAPI -> require_auth", "verify_access_token validates signature, expiry, and token payload.", "Expired or bad badges are rejected."],
                ["6", "FastAPI -> protected_purpose", "require_purpose rejects missing purpose and records deny audit.", "No purpose means no access."],
                ["7", "FastAPI -> ensure_scope", "Endpoint-specific scopes such as travel:plan, self:trips, admin:summary are checked.", "A traveler cannot read admin summary just because they are logged in."],
                ["8", "Route -> TravelStore", "save_audit_event persists allow/deny decisions with redacted message and purpose.", "The system keeps a receipt trail."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["Role or context", "Scopes used by current workflows", "What it can do"],
                ["Travel agent demo", "travel:plan, calendar:freebusy, policy:read, budget:self, visa:self, supplier:search, self:trips, traveler:read", "Plan, chat, manage corporate requests, inspect roster, update traveler records."],
                ["Admin demo", "admin:summary, admin:audit, approval:read, budget:aggregate, policy:read, policy:write, plus travel scopes", "Read summaries/audit, manage policy/company context, and switch into agent work where allowed."],
                ["Inbound email owner", "demo_auth_context(TRAVEL_AI_INBOUND_OWNER_EMAIL or demo.agent@unipro.com)", "Runs automated pipeline on parsed inbound messages without a human browser session."],
            ],
            [1.45 * inch, 3.0 * inch, 2.8 * inch],
        )
    )
    story.append(PageBreak())

    add_section(story, "6. Classic Trip Planner Workflow")
    story.append(p("This is the older but still implemented traveler-level planning path. It uses TravelRequest and Trip models rather than CorporateTravelRequest. It is useful for understanding provider search and security patterns that the corporate workflow reuses."))
    story.extend(
        sequence_table(
            "Sequence diagram: /api/agent/plan",
            [
                ["1", "UI/api.ts -> main.py", "planTrip posts TravelRequest to /api/agent/plan.", "The traveler or agent asks for a draft trip."],
                ["2", "main.py -> security.py", "authorize_traveler_agent_chain checks all required tool scopes.", "The full planning chain must be allowed before planning."],
                ["3", "main.py -> agent.py", "plan_trip calculates risk, nights, live providers, offers, itinerary, policy checks.", "The app builds a trip draft and flags risk."],
                ["4", "agent.py -> provider APIs", "Search order can include Duffel direct, Booking direct/RapidAPI, MCP tools, then deterministic fallbacks.", "Real inventory is used when configured; otherwise planning remains testable."],
                ["5", "agent.py -> main.py", "PlanResponse includes Trip, risk, user_message, audit_events.", "The response says what happened and what still needs manual sourcing."],
                ["6", "main.py -> store.py", "Audit events are persisted with actor, purpose, and allow decision.", "Provider search proof is written to the audit log."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["Endpoint", "Model", "Purpose", "Notes"],
                ["POST /api/agent/plan", "TravelRequest -> PlanResponse", "Generate a provider-informed draft plan.", "Does not save the trip unless /api/trips is used."],
                ["POST /api/trips", "TravelRequest -> Trip", "Generate and save a draft trip.", "Trip rows are row-scoped by owner_id."],
                ["GET /api/trips", "list[Trip]", "Read own saved trips.", "Traveler can only read their own owner_id rows."],
                ["POST /api/agent/chat", "ChatRequest -> ChatResponse", "Ask assistant about a trip/request context.", "Uses OpenRouter or DeepSeek when configured."],
                ["POST /api/tools/currency-conversion", "CurrencyConversionRequest -> CurrencyConversionResponse", "Convert USD estimates to selected currency.", "Tries MCP tool, daily backup rate, then planning constants."],
            ],
            [1.75 * inch, 1.75 * inch, 2.35 * inch, 1.4 * inch],
        )
    )

    add_section(story, "7. Corporate Request Manual Planning Workflow")
    story.append(p("Most current product work is here. The agent creates or opens a CorporateTravelRequest, generates a plan, edits the plan, records approval, finalizes, then exports. The frontend converts backend snake_case models to UI-friendly camelCase types in api.ts."))
    story.extend(
        flow_row(
            "Manual corporate flow",
            ["Create", "Generate plan", "Edit", "Approve", "Finalize", "Download"],
        )
    )
    story.extend(
        sequence_table(
            "Sequence diagram: corporate plan generation",
            [
                ["1", "UI -> POST /api/corporate/requests", "create_corporate_request assigns id, owner_id, department, timestamps.", "A new travel job is saved to the queue."],
                ["2", "UI -> POST /plan", "generate_corporate_request_plan loads authorized request and reference rows.", "The agent asks the system to prepare options."],
                ["3", "main.py -> _enrich_request_from_reference_data", "Traveler history and visa rows fill gaps such as nationality, preferences, document status.", "Known company/traveler facts are reused."],
                ["4", "main.py -> generate_corporate_plan", "agent.py creates readiness, budget policy check, options, flight/hotel offers, notes, drafts.", "The planning engine decides what is safe and ready."],
                ["5", "agent.py -> privacy gateway -> LLM", "If LLM is configured, payload is tokenized, leak-checked, sent, rehydrated, then constrained.", "AI can improve wording but cannot override core facts."],
                ["6", "main.py -> store.py", "Plan is saved to generated_plan; status becomes Missing Info, Waiting for Approval, or Plan Generated.", "The queue updates based on the result."],
                ["7", "UI -> PUT /plan", "Agent edits selected option, budget, traveler, dates, preferences, drafts.", "Visible edits are persisted."],
                ["8", "UI -> POST /finalize", "Finalization requires generated plan, agent_reviewed, not Cancelled, and Received approval if required.", "The final itinerary cannot be produced too early."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["Backend status", "Frontend category", "Meaning"],
                ["New / New Entries", "New Entries", "New request exists but has not entered the planning lifecycle."],
                ["Pending Details / Missing Info", "Pending Details", "Required fields are missing or plan found follow-up items."],
                ["Processing / Ready for Planning / Plan Generated / Waiting for Approval", "Processing", "Agent work is underway or client approval is needed."],
                ["Finalized / Completed", "Completed", "Final itinerary/export path is complete."],
                ["Cancelled", "Completed or inactive", "No more active workflow unless reopened by code change."],
            ],
            [1.7 * inch, 1.45 * inch, 4.1 * inch],
        )
    )
    story.append(PageBreak())

    add_section(story, "8. Automated Intake And Email Pipeline")
    story.append(p("The automated pipeline is the closest current match to the PRD's autonomous fulfillment idea. It does not ticket travel, but it can take a complete request, generate options, create three option PDFs, log email metadata, accept client approval, and send a final itinerary artifact."))
    story.extend(
        sequence_table(
            "Sequence diagram: /pipeline happy path",
            [
                ["1", "Agent/email -> request row", "A request is created manually, uploaded from PDF/Excel, or parsed from inbound Resend email.", "A client request enters the system."],
                ["2", "main.py -> _run_automated_pipeline", "Audit corporate.pipeline.started; run _intake_required_missing.", "The pipeline checks whether it has enough basics."],
                ["3", "If missing", "Save Pending Details with _pending_details_plan; audit pending_details.", "If basics are missing, stop early and tell agent what is needed."],
                ["4", "If complete", "Load company_policy, traveller_history, visa_rules; enrich request.", "Company context is attached before planning."],
                ["5", "Generate plan", "generate_corporate_plan returns customer-safe plan and three options.", "The system prepares the option pack."],
                ["6", "Send option pack", "_send_option_package_agent creates three option PDFs and calls send_resend_notification.", "The client gets the choices, or a manual-follow-up event is recorded if email is not configured."],
                ["7", "Client approval", "POST /client-approval or inbound email/PDF reply selects option index/name.", "The chosen option becomes the final plan."],
                ["8", "Final send", "_send_final_itinerary_agent sends final itinerary PDF and records EmailEvent.", "The traveler receives the final reviewed itinerary artifact."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["Intake source", "Endpoint/function", "Current behavior"],
                ["Manual agent create", "POST /api/corporate/requests", "Creates request only; agent chooses when to plan or pipeline."],
                ["PDF form upload", "POST /api/corporate/requests/upload-excel", "PDF text is extracted, mapped into request rows, saved, and pipelined."],
                ["Excel/company workbook", "POST /api/corporate/upload-excel", "Reads travel requests, employee profile/history, visa records, and reference rows."],
                ["Inbound email", "POST /api/mail/resend/webhook with email.received", "Fetches message body/attachments from Resend, parses request rows, or recognizes approval replies/selected option PDFs."],
                ["Client option reply", "_try_complete_inbound_approval", "Looks for corp_req id plus approve/selected/go ahead and optional option number."],
                ["Returned option PDF", "_try_complete_selected_option_pdf", "Extracts request id and Itinerary Option number from PDF text, then completes pipeline."],
            ],
            [1.55 * inch, 2.3 * inch, 3.4 * inch],
        )
    )
    story.append(callout("Layman explanation", "Think of /pipeline as the assembly line. If the incoming form has enough core fields, it creates the option pack. If not, it parks the request in Pending Details with a clear reason instead of making up data.", PALE_BLUE))

    add_section(story, "9. POPIA Privacy Gateway And AI Boundary")
    story.append(p("The privacy gateway is application-level anonymization. It is not k-means clustering. Clustering groups similar records; it does not reliably detect and remove exact PII before a model call. For a privacy gateway, deterministic tokenization, strict regex/key-based detection, and fail-fast leak checks are more auditable. A local LLM could be added later for document classification, but raw PII should still be removed before external AI."))
    story.extend(
        flow_row(
            "External AI privacy flow",
            ["Raw request", "Collect PII", "Tokenize", "Leak guard", "External LLM", "Rehydrate", "Constrain"],
        )
    )
    story.extend(
        sequence_table(
            "Sequence diagram: corporate LLM enhancement",
            [
                ["1", "agent.py", "Build payload with request, policy rows, history rows, visa rows, validated_base_plan, and required JSON shape.", "The model gets context plus the exact allowed output format."],
                ["2", "privacy_gateway.py", "anonymize_for_external_ai replaces names, email, phone, employee ids, passports, identity ids, and loyalty ids with token hashes.", "Private fields become labels like EMAIL_xxx before leaving the app."],
                ["3", "privacy_gateway.py", "assert_no_raw_pii scans serialized payload and token map for raw PII leakage.", "If private data remains, the app fails before calling AI."],
                ["4", "agent.py -> _chat_completion", "External LLM receives tokenized JSON and strict system prompt.", "AI can rewrite, but it cannot see the real person."],
                ["5", "privacy_gateway.py", "rehydrate_from_vault replaces tokens with real values only inside backend memory.", "The app puts the real values back after the AI returns."],
                ["6", "agent.py", "CorporateTravelPlan.model_validate enforces schema; deterministic base fields override sensitive facts and prices.", "AI text is accepted only if it fits the contract."],
                ["7", "security.py", "mask_sensitive_customer_text hides passport-like ids in customer drafts/exports.", "Customer artifacts do not expose full document numbers."],
                ["8", "internal_logger.py", "LLM failures log corporate.llm_enhancement.failed with redacted fields.", "Developers see what broke without leaking secrets or PII."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["PII category", "Detection source", "Replacement style"],
                ["Person names", "Known field keys such as traveler_name, passenger_name, employee_name", "PERSON_<hash>"],
                ["Email", "Field keys plus EMAIL_RE", "EMAIL_<hash>"],
                ["Phone", "Field keys plus PHONE_RE and looks_like_phone", "PHONE_<hash>"],
                ["Employee/staff ids", "employee_id, traveler_id, staff_id keys", "EMPLOYEE_ID_<hash>"],
                ["Passport/id", "passport_number/id_number keys plus passport regex", "PASSPORT_<hash> or IDENTITY_ID_<hash>"],
                ["Loyalty accounts", "loyalty_number, airline_account_ref, hotel_account_ref", "LOYALTY_ID_<hash>"],
            ],
            [1.6 * inch, 3.25 * inch, 2.4 * inch],
        )
    )
    story.append(PageBreak())

    add_section(story, "10. Provider Search, Ranking, And Fallbacks")
    story.append(p("Provider search is used for planning inventory only. The code is careful not to create bookings, orders, payments, or ticket confirmations. When providers are unavailable, synthetic offers keep the MVP testable but agent notes say manual sourcing is required."))
    story.extend(
        flow_row(
            "Flight and hotel search flow",
            ["Request", "Duffel", "Booking", "MCP", "Synthetic", "Plan"],
        )
    )
    story.append(
        data_table(
            [
                ["Provider path", "Trigger", "Output", "Audit or note"],
                ["Duffel direct API", "DUFFEL_API_TOKEN set", "Offer objects mapped to CorporateFlightOffer with source duffel.", "duffel.api.search or unavailable event."],
                ["Duffel MCP tool", "TRAVEL_AI_MCP_TOOLS_URL set and direct unavailable", "MCP flight offers.", "mcp.duffel.search or unavailable event."],
                ["Booking.com Demand API", "BOOKING_COM_TOKEN and affiliate/city id config", "Hotel Offer objects.", "booking.api.search or unavailable event."],
                ["Booking RapidAPI", "RAPIDAPI_BOOKING_KEY set", "Hotel offers mapped from RapidAPI payload.", "booking.rapidapi.search or unavailable event."],
                ["Synthetic planning offers", "No provider result or provider failure", "Nonzero flight/hotel planning options.", "Agent notes say manual sourcing is required before ticketing/confirmation."],
                ["Currency conversion", "Budget currency not USD", "Converted estimated costs.", "MCP conversion, daily backup rate, or planning rate note."],
            ],
            [1.65 * inch, 2.0 * inch, 2.25 * inch, 1.35 * inch],
        )
    )
    story.append(callout("Important impact", "Provider failure should not make the UI pretend a ticket exists. It should produce a plan for agent review, add provider notes, write audit/log evidence, and keep final booking outside the MVP.", PALE_YELLOW))

    add_section(story, "11. Finalization, Export, And Email Workflow")
    story.append(p("Finalization is deliberately gated. The user cannot download final artifacts until a generated plan exists and the required approval state is satisfied. This prevents a draft or rejected plan from being presented as a completed itinerary."))
    story.extend(
        sequence_table(
            "Sequence diagram: approval to final export",
            [
                ["1", "UI -> /notifications", "Send approval_request email with option PDFs or customer note.", "The client is asked to approve."],
                ["2", "mailer.py", "send_resend_notification uses Resend when configured, otherwise returns configuration_required.", "Email setup gaps are visible but do not crash the app."],
                ["3", "Client -> /client-approval", "Agent records selected_option_name or selected_option_index.", "The approved choice is captured."],
                ["4", "main.py", "_complete_request_from_client_approval_agent updates selected offer ids and final itinerary draft.", "The plan becomes the selected itinerary."],
                ["5", "UI -> /finalize", "Finalization checks generated plan, agent_reviewed, not Cancelled, and approval Received when required.", "The final button is blocked until review and approval are true."],
                ["6", "UI -> /export.pdf or /export.xlsx", "Exports are allowed only for Finalized or Completed requests with generated_plan.", "Only completed work can be downloaded."],
                ["7", "main.py", "_customer_safe_plan and mask_sensitive_customer_text mask document values.", "Passport numbers do not leak into final artifacts."],
                ["8", "Audit/email stores", "corporate.finalize.allowed, export allowed, email events are saved.", "The ledger shows finalization and delivery evidence."],
            ],
        )
    )
    story.append(
        data_table(
            [
                ["Artifact", "Endpoint/function", "Gate"],
                ["Option PDF", "GET /api/corporate/requests/{id}/options/{1..3}.pdf", "generated_plan must exist and index must be 1, 2, or 3."],
                ["Final PDF", "GET /api/corporate/requests/{id}/export.pdf", "status must be Finalized or Completed and generated_plan must exist."],
                ["Final Excel", "GET /api/corporate/requests/{id}/export.xlsx", "same gate as final PDF."],
                ["Client request form", "GET /api/corporate/request-form.pdf", "travel:plan scope."],
                ["Excel template", "GET /api/corporate/excel-template", "travel:plan scope."],
                ["Final itinerary email", "POST /api/corporate/requests/{id}/notifications with final_itinerary", "request must be Finalized or Completed."],
            ],
            [1.65 * inch, 3.25 * inch, 2.35 * inch],
        )
    )

    add_section(story, "12. Traveler Roster And Policy Workflows")
    story.append(p("Roster and policy screens are implemented as supporting operational context. They are not the primary workflow, but they affect planning because traveler profile/history and policy rows can enrich requests."))
    story.append(
        data_table(
            [
                ["Workflow", "Backend endpoints", "Frontend screens", "Effect on other workflows"],
                ["Traveler roster", "GET /api/travelers, GET/PUT /api/travelers/{id}", "/travelers, /travelers/{id}", "Profiles provide reusable traveler data; document status and preferences can inform planning and follow-up."],
                ["Roster review cards", "Frontend local review queue plus PUT traveler save", "Traveler Roster", "Registration/update forms are reviewed before long-term roster changes."],
                ["Policy center", "GET /api/policies, /api/policies/{id}, /versions, /activity", "/policy, /policy/{id}, /policy/activity", "Policy rows can become planning context; policy screens expose lifecycle/audit state."],
                ["Policy revision decisions", "POST /approve, POST /request-changes", "/policy/{id}/review", "Records policy activity and keeps active/proposed rule distinction visible."],
                ["Company policy upload", "POST /api/corporate/company-policy/upload-pdf", "Admin/policy upload affordance", "Extracted rules are saved as reference rows and PolicyGroup data."],
                ["Company pipeline status", "GET /api/corporate/companies", "Admin/company readiness cards", "Shows whether traveler list, policy, visa records, and history exist for planning context."],
            ],
            [1.25 * inch, 2.3 * inch, 1.65 * inch, 2.05 * inch],
        )
    )
    story.append(PageBreak())

    add_section(story, "13. Frontend Command-Center Workflow")
    story.append(p("The frontend is not just a skin over the API. It maps backend models to compact operational states, parses some guide commands locally, persists certain edits immediately, and sends rich context to the assistant."))
    story.extend(
        flow_row(
            "Frontend state flow",
            ["Login", "Load queue", "Open workspace", "Guide command", "Persist", "Refresh"],
        )
    )
    story.append(
        data_table(
            [
                ["Frontend function/surface", "Behavior", "Backend dependency"],
                ["apiBase", "Uses NEXT_PUBLIC_TRAVEL_AI_API_BASE_URL or /travel-ai when mounted under shared route.", "All API calls."],
                ["authHeaders", "Adds bearer token and X-Travel-Purpose.", "Security and audit."],
                ["mapCorporateRequest", "Converts backend snake_case to UI fields, status buckets, option cards, selected offers.", "Corporate queue/workspace."],
                ["RequestDetail", "Guided stepper: Missing Info, Flights, Hotel, Itinerary, Approval & Export.", "GET/POST/PUT /api/corporate/requests."],
                ["Guide command parsing", "Recognizes budget, nationality, date, and text-field updates locally.", "PUT /plan for durable changes."],
                ["chatWithAssistant", "Sends selected request, selected flight/hotel, active step, critical issue, and route constraints.", "/api/agent/chat."],
                ["TravelerRosterScreen", "Lists travelers and local review cards; approve saves traveler profile.", "/api/travelers."],
                ["AuditArchiveScreen", "Combines audit events and email events into evidence views.", "/api/admin/audit and /api/corporate/admin/email-events."],
            ],
            [1.55 * inch, 3.5 * inch, 2.2 * inch],
        )
    )
    story.append(callout("Why this matters", "Some behavior lives in the frontend by design. For example, changing a visible guided field can immediately serialize the current draft and PUT it back to the backend. When debugging, check api.ts mapping and TravelAppScreens.tsx state together.", PALE_BLUE))

    add_section(story, "14. Security, Observability, And Failure Modes")
    story.append(p("The current implementation favors safe degradation: visible user messages stay generic, audit events show operational decisions, and internal logs carry sanitized technical context."))
    story.append(
        data_table(
            [
                ["Failure or edge case", "Current behavior", "Where to inspect"],
                ["Missing auth token", "401 Unauthorized.", "main.py require_auth."],
                ["Missing purpose header", "403 Forbidden plus deny audit event.", "protected_purpose and store.save_audit_event."],
                ["Wrong scope", "403 Forbidden plus deny audit event.", "ensure_scope / ensure_any_scope."],
                ["Provider unavailable", "Plan still returns synthetic/manual-sourcing options and provider notes.", "agent.py provider functions and audit events."],
                ["LLM unavailable or bad schema", "Base deterministic plan is returned; sanitized internal log records failure.", "agent.py _enhance_corporate_plan_with_llm and internal_logger.py."],
                ["Outbound AI PII leak", "PrivacyGatewayError before external call.", "privacy_gateway.py assert_no_raw_pii."],
                ["Email provider missing", "EmailEvent status configuration_required with manual follow-up safe_message.", "mailer.py send_resend_notification."],
                ["Finalization too early", "400 Final itinerary is not ready plus deny audit event.", "main.py finalize/export/notification gates."],
                ["Webhook signature configured but invalid", "400 Invalid webhook signature.", "main.py _verify_resend_webhook."],
                ["Raw passport in customer draft", "Customer-safe plan masks identifier before save/export.", "security.py mask_sensitive_customer_text and main.py _customer_safe_plan."],
            ],
            [1.75 * inch, 3.4 * inch, 2.1 * inch],
        )
    )
    story.append(
        code_block(
            "Internal log example shape:\n"
            "travel_ai.internal WARNING internal_issue {\"event_type\":\"corporate.llm_enhancement.failed\","
            "\"provider\":\"OpenRouter\",\"request_id\":\"corp_req_...\",\"error_type\":\"RuntimeError\","
            "\"error_message\":\"... [redacted-email] ... [redacted-token] ...\"}"
        )
    )

    add_section(story, "15. Database And Stored Records")
    story.append(p("SQLite is initialized by TravelStore when a request touches storage. Most complex models are stored as JSON payloads. Audit and email records are separate because they are evidence trails rather than mutable request state."))
    story.append(
        data_table(
            [
                ["Table", "Primary content", "Notes"],
                ["trips", "Trip payload JSON plus encrypted sensitive_payload_json.", "Classic trip planner persistence."],
                ["audit_events", "id, trip_id, actor_id, event_type, message, purpose, decision, created_at.", "Messages and purposes are redacted before save."],
                ["corporate_requests", "CorporateTravelRequest JSON with owner/status/timestamps.", "Main request queue source."],
                ["corporate_reference_data", "kind and JSON rows for company_policy, traveller_history, visa_rules.", "Used to enrich corporate plans."],
                ["travelers", "TravelerProfile JSON.", "Seeded from requests when empty, then updatable."],
                ["policy_groups", "PolicyGroup JSON.", "Seeded policy data plus uploaded policy groups."],
                ["policy_activity_events", "Policy activity JSON.", "Revision and review trail."],
                ["email_events", "EmailEvent JSON.", "Outbound/inbound Resend delivery evidence."],
            ],
            [1.55 * inch, 3.7 * inch, 2.0 * inch],
        )
    )

    add_section(story, "16. Developer Entry Points")
    story.append(
        data_table(
            [
                ["Need to understand", "Start here", "Then inspect"],
                ["Routes and gates", "backend/app/main.py", "tests/test_backend_api.py and tests/test_corporate_backend_api.py."],
                ["Corporate planning decisions", "backend/app/agent.py", "privacy_gateway.py and tests around POPIA/LLM payload."],
                ["Data model contract", "backend/app/models.py", "frontend/src/lib/types.ts and api.ts mapping."],
                ["Persistence and audit", "backend/app/store.py", "tests asserting audit redaction, row scope, finalization gates."],
                ["Email lifecycle", "backend/app/mailer.py", "main.py Resend webhook functions and EmailEvent tests."],
                ["Frontend workflow", "frontend/src/components/TravelAppScreens.tsx", "frontend/tests/e2e/travel-ui.spec.ts and component tests."],
                ["Current product decisions", "CONTEXT.md, docs/agent-workflow-discussion.md, docs/workflow-feature-map.md", "docs/superpowers/plans for historical implementation plans."],
            ],
            [1.6 * inch, 2.7 * inch, 2.95 * inch],
        )
    )
    story.append(
        code_block(
            "Local verification commands used for the current backend path:\n"
            "/tmp/travel-ai-test-venv/bin/python -m pytest tests/test_backend_security.py tests/test_backend_api.py tests/test_corporate_backend_api.py -q\n\n"
            "Local dev servers for screenshots:\n"
            "backend: uvicorn app.main:app --host 127.0.0.1 --port 8100\n"
            "frontend: npm run dev -- -H 127.0.0.1 -p 3100"
        )
    )
    story.append(PageBreak())

    add_section(story, "17. Tests As Workflow Documentation")
    story.append(p("The tests are currently the most exact source for behavior. Use them as executable workflow documentation. If a workflow is not tested, treat it as less proven."))
    story.append(
        data_table(
            [
                ["Test file", "Workflow coverage"],
                ["tests/test_backend_security.py", "Redaction, privacy gateway tokenization, raw PII blocking, internal logger sanitization, short-lived tokens, encrypted sensitive payloads, LLM/storage separation."],
                ["tests/test_backend_api.py", "Classic agent plan, provider search paths, currency conversion, trip persistence, admin summary/audit, row-level trip access, chat model selection."],
                ["tests/test_corporate_backend_api.py", "Corporate CRUD, planning, provider offers, POPIA LLM payload, upload pipeline, option PDFs, client approval, Resend inbound replies, selected option PDFs, finalization/export, traveler roster, policy lifecycle."],
                ["frontend/src/components/__tests__/TravelApp.test.tsx", "Command-center UI behavior, status mapping, request workspace, traveler roster review, emails, admin/audit surfaces."],
                ["frontend/tests/e2e/travel-ui.spec.ts", "Desktop workflow: login, dashboard, upload, planning, selected flight/hotel context, critical issue recovery, approval/export, roster, admin redirect."],
                ["frontend/src/app/production-routes.test.tsx", "Native app routes render for requests, itineraries, travelers, policy, review, and activity; policy CSV/export behavior."],
            ],
            [2.15 * inch, 5.1 * inch],
        )
    )

    add_section(story, "18. What To Build Next For A Perfect PoC")
    story.append(p("This is a practical gap list based on the implemented code, not a sales roadmap. It focuses on the minimum changes that would make the PoC closer to the PRD without claiming full production ticketing too early."))
    story.append(
        data_table(
            [
                ["Priority", "Next build item", "Why it matters"],
                ["1", "Add strict request validation matrix with IATA lookup and explicit mandatory/optional field contract.", "Matches PRD ingestion guarantees and prevents bad routes from entering planning."],
                ["2", "Upgrade option generation from exactly 3 to configurable 4 or 5 packages if the business still wants 4-5.", "Current model hard-codes 3 options across API, PDF, and UI."],
                ["3", "Turn privacy gateway into a network-style sidecar/service or middleware boundary if required.", "Current app-layer gateway is good for PoC; a network gateway would enforce separation more strongly."],
                ["4", "Add local LLM or document classifier for form type classification while keeping deterministic PII tokenization before external AI.", "Useful for varied forms, but clustering alone should not be the PII control."],
                ["5", "Add real email/portal intake watcher job and WhatsApp structured form adapter.", "Current inbound exists through Resend webhook and uploads, not active polling across all PRD channels."],
                ["6", "Add streaming inventory channel if live multi-provider latency becomes visible.", "Current API waits for response; no SignalR/WebSocket streaming."],
                ["7", "Integrate actual GDS/order/ticketing only behind explicit approval and compliance gates.", "This is the boundary between itinerary operations and true autonomous fulfillment."],
                ["8", "Add fare-rule amendment/cancellation workflow before emergency ticket modifications.", "Critical issue mode exists; penalty calculation and ticket amend/cancel are not implemented."],
            ],
            [0.65 * inch, 3.55 * inch, 3.05 * inch],
            header_color=CORAL,
        )
    )
    story.append(callout("Bottom line", "For a perfect PoC, keep the strongest claim narrow and defensible: automated corporate travel operations from intake to reviewed itinerary export, with POPIA-safe AI narrative assistance. Do not claim autonomous ticketing until GDS/order flows are actually integrated and tested.", PALE_CORAL))

    return story


def markdown_source() -> str:
    return """# Travel AI Current Workflows Developer Guide

Generated from the local standalone `travel-ai` codebase on 2026-05-25.

## Scope

This guide documents implemented workflows in `backend/app`, `frontend/src`, `tests`, and current repo docs. It does not claim live GDS ticketing, SignalR streaming, WhatsApp intake, production SSO, or SendGrid because those are not implemented in this codebase.

## Main lifecycle

```mermaid
flowchart LR
  A[Intake] --> B[Validate]
  B --> C[Plan]
  C --> D[Agent Review]
  D --> E[Approval]
  E --> F[Finalize]
  F --> G[Export / Email Evidence]
```

## Corporate automated pipeline

```mermaid
sequenceDiagram
  participant Source as Upload / Inbound Email / Manual Request
  participant API as FastAPI main.py
  participant Store as TravelStore
  participant Planner as agent.py
  participant Privacy as privacy_gateway.py
  participant Mail as Resend mailer
  Source->>API: Create or import CorporateTravelRequest
  API->>Store: Save request and audit pipeline.started
  API->>API: Check itinerary-critical missing fields
  alt Missing fields
    API->>Store: Save Pending Details plan
  else Complete request
    API->>Planner: generate_corporate_plan
    Planner->>Privacy: Tokenize and leak-check external AI payload
    Privacy-->>Planner: Safe anonymized payload
    Planner->>Planner: Deterministic planning + optional LLM narrative
    Planner-->>API: CorporateTravelPlan
    API->>Store: Save Processing request
    API->>Mail: Send three option PDFs
    Mail-->>Store: EmailEvent
  end
```

## POPIA external AI boundary

```mermaid
sequenceDiagram
  participant Planner as agent.py
  participant Gateway as privacy_gateway.py
  participant LLM as External LLM
  Planner->>Gateway: Payload with request, policy, history, visa, base plan
  Gateway->>Gateway: Collect keyed PII and regex PII
  Gateway->>Gateway: Replace raw values with token hashes
  Gateway->>Gateway: assert_no_raw_pii
  Gateway-->>Planner: Anonymized payload + token map
  Planner->>LLM: Tokenized strict JSON request
  LLM-->>Planner: Tokenized JSON plan
  Planner->>Gateway: Rehydrate values
  Planner->>Planner: Validate model and restore deterministic facts
```

## Key files

| Area | Files |
| --- | --- |
| Routes and gates | `backend/app/main.py` |
| Planning engine | `backend/app/agent.py` |
| Privacy gateway | `backend/app/privacy_gateway.py` |
| Security and redaction | `backend/app/security.py` |
| Persistence and audit | `backend/app/store.py` |
| Mail and webhooks | `backend/app/mailer.py`, `backend/app/main.py` |
| Frontend command center | `frontend/src/components/TravelAppScreens.tsx` |
| API mapping | `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts` |
| Workflow tests | `tests/test_backend_api.py`, `tests/test_backend_security.py`, `tests/test_corporate_backend_api.py`, `frontend/tests/e2e/travel-ui.spec.ts` |

See the PDF for the detailed tables, sequence explanations, screenshots, and implemented-versus-gap analysis.
"""


def write_markdown() -> None:
    MD_PATH.write_text(markdown_source(), encoding="utf-8")


def build_pdf() -> None:
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        leftMargin=0.55 * inch,
        rightMargin=0.55 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.58 * inch,
        title="Travel AI Current Workflows Developer Guide",
        author="OpenAI Codex",
    )
    doc.build(build_story(), onFirstPage=cover_page, onLaterPages=header_footer)


def main() -> None:
    write_markdown()
    build_pdf()
    print(PDF_PATH)
    print(MD_PATH)


if __name__ == "__main__":
    main()
