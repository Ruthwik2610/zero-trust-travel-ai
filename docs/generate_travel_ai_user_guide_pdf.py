from pathlib import Path

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
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "docs" / "Travel_AI_User_Guide.pdf"
IMAGE_DIR = ROOT / "frontend" / "public"

NAVY = colors.HexColor("#17233f")
BLUE = colors.HexColor("#2563eb")
TEAL = colors.HexColor("#0f766e")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#526173")
LINE = colors.HexColor("#d8e0ea")
SURFACE = colors.HexColor("#f5f7fb")
PALE_BLUE = colors.HexColor("#eaf1ff")
PALE_TEAL = colors.HexColor("#e7f6f2")


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=30,
        leading=34,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=12.5,
        leading=18,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=18,
    )
)
styles.add(
    ParagraphStyle(
        name="SectionTitle",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=NAVY,
        spaceBefore=4,
        spaceAfter=10,
    )
)
styles.add(
    ParagraphStyle(
        name="SubTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=16,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.4,
        leading=13,
        textColor=INK,
        spaceAfter=6,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.3,
        leading=11.5,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="CardTitle",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.5,
        leading=13,
        textColor=NAVY,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8.2,
        leading=10,
        textColor=colors.white,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=10.5,
        textColor=INK,
    )
)


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullets(items):
    return ListFlowable(
        [ListItem(p(item, "Body"), leftIndent=10) for item in items],
        bulletType="bullet",
        start="circle",
        leftIndent=14,
        bulletFontName="Helvetica",
        bulletFontSize=6,
        bulletColor=BLUE,
    )


def card(title, body, tint=SURFACE):
    table = Table(
        [[p(title, "CardTitle")], [p(body, "Small")]],
        colWidths=[2.28 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), tint),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )
    return table


def image_or_spacer(relative_path, width, height):
    path = IMAGE_DIR / relative_path
    if not path.exists():
        return Spacer(width, height)
    img = Image(str(path), width=width, height=height)
    img.hAlign = "CENTER"
    return img


def data_table(rows, widths):
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (0, 1), (-1, -1), colors.white),
            ]
        )
    )
    return table


def header_footer(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    width, height = letter
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(doc.leftMargin, height - 0.45 * inch, "Travel AI User Guide")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, height - 0.45 * inch, f"Page {page}")
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, height - 0.58 * inch, width - doc.rightMargin, height - 0.58 * inch)
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(colors.HexColor("#f4f7fb"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 1.05 * inch, width, 1.05 * inch, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(doc.leftMargin, height - 0.56 * inch, "UNIPRO TRAVEL AI")
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, height - 0.56 * inch, "Guided itinerary builder")
    canvas.restoreState()


def build_story():
    story = []

    story.append(Spacer(1, 0.55 * inch))
    story.append(p("Travel AI User Guide", "CoverTitle"))
    story.append(
        p(
            "Agent and manager workflows for request intake, policy-aware planning, critical recovery, approval, and final itinerary export.",
            "CoverSubtitle",
        )
    )
    story.append(image_or_spacer("login-airport-reference.png", 6.6 * inch, 2.65 * inch))
    story.append(Spacer(1, 0.22 * inch))
    story.append(
        Table(
            [
                [
                    card("Travel Agent", "Plan requests, resolve missing details, select flights and hotels, handle recovery, and export reviewed itineraries.", PALE_BLUE),
                    card("Application Admin", "Import traveler workbooks and policy PDFs, then hand the company context to the agent workspace.", PALE_TEAL),
                    card("Guided Builder", "One workflow replaces separate readiness, planning, and chat tabs.", SURFACE),
                ]
            ],
            colWidths=[2.28 * inch, 2.28 * inch, 2.28 * inch],
            style=TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 3), ("RIGHTPADDING", (0, 0), (-1, -1), 3)]),
        )
    )
    story.append(PageBreak())

    story.append(p("1. Sign In And Roles", "SectionTitle"))
    story.append(p("Use the role selector on the sign-in screen. Agent access stays focused on request operations. Admin access opens company and governance controls, with an option to switch into Travel Agent from the top bar.", "Body"))
    rows = [
        [p("Workspace", "TableHead"), p("Username", "TableHead"), p("Password", "TableHead"), p("Expected access", "TableHead")],
        [p("Travel Agent", "TableCell"), p("agent", "TableCell"), p("travel-demo-2026", "TableCell"), p("Agent Operations and Itineraries only.", "TableCell")],
        [p("Application Admin", "TableCell"), p("admin", "TableCell"), p("travel-demo-2026", "TableCell"), p("Application Admin and switch to Travel Agent.", "TableCell")],
    ]
    story.append(data_table(rows, [1.35 * inch, 1.2 * inch, 1.5 * inch, 2.75 * inch]))
    story.append(Spacer(1, 0.15 * inch))
    story.append(p("Role checks", "SubTitle"))
    story.append(bullets([
        "The agent account must not see Application Admin, Traveler Data, or Policy Control.",
        "The admin account can switch into the agent workspace when reviewing operating flow.",
        "Visible controls should either work, route to a real screen, or be removed from the demo path.",
    ]))

    story.append(p("2. Agent Request Intake", "SectionTitle"))
    story.append(p("Travel Operations is the agent's daily queue. Use it to search requests, filter by stage, import travel forms, create manual requests, and open the guided builder.", "Body"))
    intake_rows = [
        [p("Action", "TableHead"), p("When to use it", "TableHead"), p("Expected result", "TableHead")],
        [p("Upload Forms", "TableCell"), p("A traveler request arrives as a PDF form.", "TableCell"), p("The parsed request appears in the pending queue.", "TableCell")],
        [p("New Request", "TableCell"), p("A request arrives by call, email, or message.", "TableCell"), p("The manually entered request appears in the same queue.", "TableCell")],
        [p("Search and filters", "TableCell"), p("The queue has many active requests.", "TableCell"), p("The agent can isolate pending, missing-details, approval, finalized, or critical requests.", "TableCell")],
    ]
    story.append(data_table(intake_rows, [1.45 * inch, 2.65 * inch, 2.7 * inch]))
    story.append(Spacer(1, 0.12 * inch))
    story.append(p("Local upload fixtures", "SubTitle"))
    story.append(bullets([
        "These files are local-only and ignored by Git.",
        "docs/synthetic-forms/agent-upload-vikram-johannesburg.pdf",
        "docs/synthetic-forms/agent-upload-missing-details.pdf",
    ]))
    story.append(PageBreak())

    story.append(p("3. Guided Itinerary Builder", "SectionTitle"))
    story.append(p("Opening a request starts a single guided workspace. The agent no longer moves through separate Readiness, Plan, and Chat tabs. Each step has one inline command box and one clear next action.", "Body"))
    step_rows = [
        [p("Step", "TableHead"), p("Agent decision", "TableHead"), p("What to verify", "TableHead")],
        [p("Missing Info", "TableCell"), p("Confirm traveler readiness, document gaps, and customer messages.", "TableCell"), p("Missing details are visible and editable before planning is treated as complete.", "TableCell")],
        [p("Flights", "TableCell"), p("Generate and compare route options.", "TableCell"), p("Cards show image, provider, airline, price, route, policy fit, and selected state.", "TableCell")],
        [p("Hotel", "TableCell"), p("Choose the stay after selecting a flight.", "TableCell"), p("Cards show image, hotel, address, nights, room count, guest count, price, and selected state.", "TableCell")],
        [p("Itinerary", "TableCell"), p("Review combined flight, hotel, traveler, and policy context.", "TableCell"), p("The helper explains the step without saving changes until Apply to itinerary is clicked.", "TableCell")],
        [p("Approval and Export", "TableCell"), p("Send approval, record status, finalize, and download.", "TableCell"), p("The export is a reviewed handoff. The screen does not claim ticketing or hotel booking.", "TableCell")],
    ]
    story.append(data_table(step_rows, [1.25 * inch, 2.45 * inch, 3.1 * inch]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(
        Table(
            [[image_or_spacer("travel-media/flight-aircraft.png", 2.1 * inch, 1.28 * inch), image_or_spacer("travel-media/hotel-business.png", 2.1 * inch, 1.28 * inch), image_or_spacer("travel-media/flight-recovery.png", 2.1 * inch, 1.28 * inch)]],
            colWidths=[2.25 * inch, 2.25 * inch, 2.25 * inch],
            style=TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]),
        )
    )

    story.append(p("4. Option Selection And Export", "SectionTitle"))
    story.append(p("Generate Options loads planning options. Select a flight before choosing a hotel. Select a hotel before reviewing the itinerary. Approval and export happen only after the agent reviews the final package.", "Body"))
    story.append(bullets([
        "Use the Flights command box for policy comparison, budget explanation, and route tradeoffs.",
        "Use the Hotel command box for location, nights, invoice support, and policy fit.",
        "Use the Itinerary step to confirm the combined plan before approval.",
        "Use Approval and Export to send approval, save status, generate the final itinerary, and download the workbook.",
        "Exports must mask passport and sensitive document values.",
    ]))
    story.append(PageBreak())

    story.append(p("5. Critical Issue Recovery", "SectionTitle"))
    story.append(p("When the queue marks a critical issue, such as a flight cancellation, the request opens directly on Flights. The recovery flow should focus on same-origin replacement flights, hotel adjustments, traveler messaging, and cancellation tasks.", "Body"))
    recovery_rows = [
        [p("Trigger", "TableHead"), p("Expected behavior", "TableHead")],
        [p("Critical issue selected from queue", "TableCell"), p("The builder opens directly on the Flights step.", "TableCell")],
        [p("Recovery guide command", "TableCell"), p("Payload includes recovery mode, critical issue, selected flight, selected hotel, and active step.", "TableCell")],
        [p("Recovery guidance", "TableCell"), p("Copy uses same-origin alternative language and avoids the old separate recovery chat.", "TableCell")],
    ]
    story.append(data_table(recovery_rows, [2.05 * inch, 4.75 * inch]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(card("Presenter note", "Do not describe this as automatic ticketing. Present it as recovery planning support: identify alternatives, adjust itinerary context, draft updates, and prepare the reviewed handoff.", PALE_BLUE))

    story.append(p("6. Admin Company Context", "SectionTitle"))
    story.append(p("Application Admin manages company travel context. Workbook and policy uploads enrich planning and recovery, then the agent receives the company request in Travel Operations.", "Body"))
    admin_rows = [
        [p("Admin task", "TableHead"), p("Recommended file or screen", "TableHead"), p("Expected result", "TableHead")],
        [p("Import workbook", "TableCell"), p("manager-company-context.xlsx", "TableCell"), p("Processed rows, employee profiles, skipped rows, and created request IDs where applicable.", "TableCell")],
        [p("Import policy PDF", "TableCell"), p("manager-company-policy.pdf", "TableCell"), p("Company pipeline shows policy uploaded, and planning can use policy context.", "TableCell")],
        [p("Agent handoff", "TableCell"), p("Switch to Travel Agent", "TableCell"), p("The uploaded Orbitex request appears in the queue, ready for planning with company context applied.", "TableCell")],
    ]
    story.append(data_table(admin_rows, [1.45 * inch, 2.35 * inch, 3.0 * inch]))
    story.append(PageBreak())

    story.append(p("7. Review Checklist", "SectionTitle"))
    story.append(p("Use this checklist before a customer or stakeholder walkthrough.", "Body"))
    checklist = [
        "Agent can sign in and cannot access manager-only screens.",
        "Admin can sign in, import workbook data, import policy PDF, and switch into Travel Agent.",
        "Agent receives the uploaded company request after the manager import.",
        "Uploaded agent forms create pending requests.",
        "The request workspace shows the guided builder, not Readiness, Plan, or Chat tabs.",
        "Flight and hotel cards expose visual media and selected states.",
        "Selecting a flight enables Hotel; selecting a hotel enables Itinerary.",
        "The helper explanation does not update request state until Apply to itinerary is clicked.",
        "Critical recovery opens directly on Flights and focuses on same-origin alternatives.",
        "Approval can be sent, saved, finalized, and exported.",
        "Exports mask passport and sensitive document values.",
    ]
    story.append(bullets(checklist))
    story.append(Spacer(1, 0.18 * inch))
    story.append(p("Local demo artifacts", "SubTitle"))
    artifact_rows = [
        [p("Artifact", "TableHead"), p("Path", "TableHead")],
        [p("Tutorial MP4", "TableCell"), p("frontend/public/videos/unipro-travel-ai-tutorial-voiced.mp4 (ignored by Git)", "TableCell")],
        [p("Editable guide source", "TableCell"), p("docs/Travel_AI_User_Guide.md", "TableCell")],
        [p("Final guide PDF", "TableCell"), p("docs/Travel_AI_User_Guide.pdf (ignored by Git)", "TableCell")],
        [p("Video transcript", "TableCell"), p("docs/Travel_AI_Tutorial_Transcript.md", "TableCell")],
    ]
    story.append(data_table(artifact_rows, [1.9 * inch, 4.9 * inch]))
    story.append(Spacer(1, 0.22 * inch))
    story.append(card("Final presentation framing", "Travel AI is a guided operations workspace for business travel request handling. It supports intake, policy-aware planning, recovery, approval, and export. It does not claim that tickets or hotels are booked from the reviewed itinerary screen.", PALE_TEAL))

    return story


def main():
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        rightMargin=0.58 * inch,
        leftMargin=0.58 * inch,
        topMargin=0.76 * inch,
        bottomMargin=0.58 * inch,
        title="Travel AI User Guide",
        author="Unipro",
        subject="Guided itinerary builder user guide",
    )
    doc.build(build_story(), onFirstPage=cover, onLaterPages=header_footer)
    print(PDF_PATH)


if __name__ == "__main__":
    main()
