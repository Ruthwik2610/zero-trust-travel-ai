from pathlib import Path
import subprocess

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
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
PDF_PATH = ROOT / "docs" / "Travel_AI_Client_Overview.pdf"
PUBLIC_DIR = ROOT / "frontend" / "public"
FRAME_DIR = ROOT / "tmp" / "pdfs" / "client-frames"
TMP_DIR = ROOT / "tmp" / "pdfs" / "client-overview-assets"

NAVY = colors.HexColor("#15213d")
INK = colors.HexColor("#172033")
MUTED = colors.HexColor("#526173")
BLUE = colors.HexColor("#2563eb")
TEAL = colors.HexColor("#0f766e")
GOLD = colors.HexColor("#b7791f")
LINE = colors.HexColor("#d9e2ec")
SURFACE = colors.HexColor("#f6f8fb")
SOFT_BLUE = colors.HexColor("#edf4ff")
SOFT_TEAL = colors.HexColor("#eaf7f4")
SOFT_GOLD = colors.HexColor("#fff6e5")
SOFT_RED = colors.HexColor("#fff1f0")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=28,
        leading=32,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubtitle",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=MUTED,
        alignment=TA_CENTER,
        spaceAfter=16,
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
        spaceBefore=2,
        spaceAfter=8,
    )
)
styles.add(
    ParagraphStyle(
        name="SubTitle",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=15,
        textColor=INK,
        spaceBefore=4,
        spaceAfter=4,
    )
)
styles.add(
    ParagraphStyle(
        name="Body",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.4,
        leading=13.2,
        textColor=INK,
        spaceAfter=7,
    )
)
styles.add(
    ParagraphStyle(
        name="Small",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.2,
        leading=11.2,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="CardTitle",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=10.3,
        leading=12.6,
        textColor=NAVY,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="Metric",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=16,
        textColor=NAVY,
        alignment=TA_CENTER,
        spaceAfter=2,
    )
)
styles.add(
    ParagraphStyle(
        name="MetricLabel",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=7.8,
        leading=10,
        textColor=MUTED,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHead",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10.5,
        textColor=WHITE,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.4,
        leading=11,
        textColor=INK,
    )
)
styles.add(
    ParagraphStyle(
        name="Caption",
        parent=styles["BodyText"],
        fontName="Helvetica-Bold",
        fontSize=7.8,
        leading=10,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
)


def p(text, style="Body"):
    return Paragraph(text, styles[style])


def bullets(items):
    return ListFlowable(
        [ListItem(p(item, "Body"), leftIndent=9) for item in items],
        bulletType="bullet",
        leftIndent=13,
        bulletFontName="Helvetica",
        bulletFontSize=5.5,
        bulletColor=BLUE,
        spaceAfter=5,
    )


def card(title, body, tint=SURFACE, width=2.1 * inch):
    return Table(
        [[p(title, "CardTitle")], [p(body, "Small")]],
        colWidths=[width],
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


def metric(value, label, tint=SOFT_BLUE):
    return Table(
        [[p(value, "Metric")], [p(label, "MetricLabel")]],
        colWidths=[1.58 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), tint),
                ("BOX", (0, 0), (-1, -1), 0.45, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        ),
    )


def logo_png(relative_path):
    source = PUBLIC_DIR / relative_path
    if not source.exists():
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    output = TMP_DIR / f"{source.name}.cropped.png"
    if output.exists():
        return output
    subprocess.run(
        ["qlmanage", "-t", "-s", "720", "-o", str(TMP_DIR), str(source)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    generated = TMP_DIR / f"{source.name}.png"
    if not generated.exists():
        return None
    image = PILImage.open(generated).convert("RGBA")
    pixels = image.load()
    xs = []
    ys = []
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha and not (red > 245 and green > 245 and blue > 245):
                xs.append(x)
                ys.append(y)
    if not xs:
        return generated
    margin = 10
    box = (
        max(0, min(xs) - margin),
        max(0, min(ys) - margin),
        min(image.width, max(xs) + margin),
        min(image.height, max(ys) + margin),
    )
    image.crop(box).save(output)
    return output


def clean_frame_path(name):
    source = FRAME_DIR / f"{name}.jpg"
    if not source.exists():
        return None
    TMP_DIR.mkdir(parents=True, exist_ok=True)
    output = TMP_DIR / f"{name}.clean.jpg"
    image = PILImage.open(source).convert("RGB")
    crop_boxes = {
        "builder": (0, 0, 1152, 720),
        "handoff": (0, 0, 1152, 720),
        "hotel": (0, 0, 1152, 720),
        "manager": (0, 0, 1152, 720),
        "queue": (0, 0, 1152, 720),
        "recovery": (0, 0, 1152, 720),
        "upload": (0, 0, 1152, 720),
    }
    box = crop_boxes.get(name, (0, 0, 1152, 720))
    image.crop(box).save(output, quality=92)
    return output


def screenshot(name, width, caption=None):
    path = clean_frame_path(name)
    if not path:
        return Spacer(width, width / 1.6)
    height = width / 1.6
    img = Image(str(path), width=width, height=height)
    img.hAlign = "CENTER"
    image_block = Table(
        [[img]],
        colWidths=[width],
        style=TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.6, LINE),
                ("BACKGROUND", (0, 0), (-1, -1), WHITE),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]
        ),
    )
    if not caption:
        return image_block
    return Table(
        [[image_block], [p(caption, "Caption")]],
        colWidths=[width],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 4),
                ("BOTTOMPADDING", (0, 1), (0, 1), 0),
            ]
        ),
    )


def data_table(rows, widths):
    table = Table(rows, colWidths=widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), NAVY),
                ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
                ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 7),
                ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return table


def cover(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(colors.HexColor("#f4f7fb"))
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 1.03 * inch, width, 1.03 * inch, fill=1, stroke=0)
    logo = logo_png("unipro-full-logo.svg")
    if logo:
        canvas.drawImage(
            str(logo),
            doc.leftMargin,
            height - 0.70 * inch,
            width=1.72 * inch,
            height=0.36 * inch,
            mask="auto",
            preserveAspectRatio=True,
            anchor="w",
        )
    else:
        canvas.setFillColor(WHITE)
        canvas.setFont("Helvetica-Bold", 9)
        canvas.drawString(doc.leftMargin, height - 0.55 * inch, "UNIPRO")
    canvas.setFillColor(WHITE)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, height - 0.55 * inch, "Client brief")
    canvas.restoreState()


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = letter
    logo = logo_png("unipro-full-logo.svg")
    if logo:
        canvas.drawImage(
            str(logo),
            doc.leftMargin,
            height - 0.52 * inch,
            width=0.95 * inch,
            height=0.25 * inch,
            mask="auto",
            preserveAspectRatio=True,
            anchor="w",
        )
    else:
        canvas.setFillColor(NAVY)
        canvas.setFont("Helvetica-Bold", 8)
        canvas.drawString(doc.leftMargin, height - 0.45 * inch, "Unipro Travel AI")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - doc.rightMargin, height - 0.45 * inch, f"Page {canvas.getPageNumber()}")
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, height - 0.59 * inch, width - doc.rightMargin, height - 0.59 * inch)
    canvas.restoreState()


def build_story():
    story = []

    story.append(Spacer(1, 0.50 * inch))
    story.append(p("Unipro Travel AI", "CoverTitle"))
    story.append(
        p(
            "A guided workspace for corporate travel intake, planning, recovery, approval, and itinerary handoff.",
            "CoverSubtitle",
        )
    )
    story.append(screenshot("builder", 6.55 * inch))
    story.append(Spacer(1, 0.18 * inch))
    story.append(
        Table(
            [
                [
                    card("One Operations Queue", "Requests move from intake to planning without scattered follow-up.", SOFT_BLUE),
                    card("Manager Context", "Employee workbook and policy PDF context are uploaded once and used during review.", SOFT_TEAL),
                    card("Reviewed Handoff", "Agents prepare an itinerary package that is ready for downstream action.", SOFT_GOLD),
                ]
            ],
            colWidths=[2.22 * inch, 2.22 * inch, 2.22 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ]
            ),
        )
    )
    story.append(PageBreak())

    story.append(p("Why This Matters", "SectionTitle"))
    story.append(
        p(
            "Corporate travel work is usually slowed by scattered information, repeated context checks, unclear status, and rushed follow-up when plans change. The problem is not just booking. It is the operational work required before a clean itinerary can be approved and handed off.",
            "Body",
        )
    )
    story.append(
        Table(
            [
                [
                    metric("1", "structured request queue", SOFT_BLUE),
                    metric("2", "client-owned context inputs", SOFT_TEAL),
                    metric("5", "guided workflow stages", SOFT_GOLD),
                    metric("1", "reviewed handoff package", SOFT_RED),
                ]
            ],
            colWidths=[1.68 * inch, 1.68 * inch, 1.68 * inch, 1.68 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ]
            ),
        )
    )
    story.append(Spacer(1, 0.16 * inch))
    story.append(
        Table(
            [
                [
                    [
                        p("Common friction", "SubTitle"),
                        bullets(
                            [
                                "Requests arrive through forms, PDFs, spreadsheets, and messages.",
                                "Policy and traveler context are checked manually.",
                                "Managers cannot easily see what is pending, ready, or blocked.",
                                "Recovery work often depends on ad hoc notes.",
                            ]
                        ),
                    ],
                    [
                        p("What Travel AI organizes", "SubTitle"),
                        bullets(
                            [
                                "Company context upload by the manager.",
                                "Structured queue for the travel team.",
                                "Guided itinerary planning for agents.",
                                "Recovery and handoff in the same workspace.",
                            ]
                        ),
                    ],
                ]
            ],
            colWidths=[3.25 * inch, 3.25 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )
    story.append(Spacer(1, 0.10 * inch))
    story.append(card("Positioning", "Travel AI is a corporate travel operations workspace. It supports planning, review, recovery, approval, and handoff while keeping existing booking and approval processes intact.", SOFT_BLUE, 6.62 * inch))
    story.append(Spacer(1, 0.16 * inch))
    story.append(
        Table(
            [
                [
                    card("Request clarity", "Every request has a visible owner, status, route, dates, and next action.", WHITE, 2.1 * inch),
                    card("Context control", "The manager provides the workbook and policy PDF instead of relying on scattered notes.", WHITE, 2.1 * inch),
                    card("Recovery readiness", "Critical travel issues remain attached to the itinerary workflow.", WHITE, 2.1 * inch),
                ]
            ],
            colWidths=[2.2 * inch, 2.2 * inch, 2.2 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 3),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 3),
                ]
            ),
        )
    )
    story.append(PageBreak())

    story.append(p("Manager To Agent Flow", "SectionTitle"))
    story.append(
        p(
            "The client-facing flow starts with manager-owned context and ends with the agent receiving structured work. The product keeps those two roles connected without exposing unnecessary complexity.",
            "Body",
        )
    )
    story.append(
        Table(
            [
                [
                    screenshot("manager", 3.25 * inch, "Manager uploads company workbook and policy PDF context."),
                    screenshot("upload", 3.25 * inch, "Requests appear in a structured operations queue."),
                ],
                [
                    screenshot("handoff", 3.25 * inch, "Agents receive the request list with status and next actions."),
                    screenshot("queue", 3.25 * inch, "Uploaded PDF requests are converted into a readable preview."),
                ],
            ],
            colWidths=[3.32 * inch, 3.32 * inch],
            rowHeights=[2.35 * inch, 2.35 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        )
    )
    story.append(PageBreak())

    story.append(p("Guided Planning And Recovery", "SectionTitle"))
    story.append(
        p(
            "Once a request is assigned, the agent works through a guided planning surface. Flight review, hotel selection, recovery planning, approval status, and itinerary export stay in one operational path.",
            "Body",
        )
    )
    rows = [
        [p("Stage", "TableHead"), p("What the team does", "TableHead"), p("Client value", "TableHead")],
        [
            p("Plan", "TableCell"),
            p("Review missing details, compare options, and keep request context visible.", "TableCell"),
            p("Less back-and-forth before a usable itinerary is ready.", "TableCell"),
        ],
        [
            p("Select", "TableCell"),
            p("Choose hotel and itinerary options in the same review path.", "TableCell"),
            p("More consistent decisions across travelers and trips.", "TableCell"),
        ],
        [
            p("Recover", "TableCell"),
            p("Handle cancellations or critical issues without leaving the request.", "TableCell"),
            p("Cleaner response when travel plans change.", "TableCell"),
        ],
        [
            p("Handoff", "TableCell"),
            p("Export the reviewed itinerary package for downstream use.", "TableCell"),
            p("A clearer package for booking, communication, and follow-up.", "TableCell"),
        ],
    ]
    story.append(data_table(rows, [1.05 * inch, 2.95 * inch, 2.65 * inch]))
    story.append(Spacer(1, 0.16 * inch))
    story.append(
        Table(
            [[screenshot("hotel", 3.28 * inch, "Hotel and itinerary options remain inside the guided builder."), screenshot("recovery", 3.28 * inch, "Recovery output becomes part of the reviewed handoff.")]],
            colWidths=[3.34 * inch, 3.34 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            ),
        )
    )
    story.append(PageBreak())

    story.append(p("Client Outcomes", "SectionTitle"))
    story.append(
        p(
            "The PDF and video can be shared together as a client-facing package: the video shows the working experience, and this brief explains the business value in language suited for client review.",
            "Body",
        )
    )
    story.append(screenshot("handoff", 5.9 * inch, "Agent workspace after manager context is uploaded and requests are ready for execution."))
    story.append(Spacer(1, 0.12 * inch))
    outcome_rows = [
        [p("Outcome", "TableHead"), p("What it means for the client", "TableHead")],
        [p("Faster handling", "TableCell"), p("Requests, status, planning, approval, and export live in one guided workspace.", "TableCell")],
        [p("Clearer visibility", "TableCell"), p("Managers can see readiness and pending work without chasing separate updates.", "TableCell")],
        [p("Consistent context", "TableCell"), p("Company-provided workbook and policy PDF context support request review.", "TableCell")],
        [p("Cleaner recovery", "TableCell"), p("Critical issues stay connected to the itinerary instead of becoming separate follow-up threads.", "TableCell")],
        [p("Better handoff", "TableCell"), p("The reviewed itinerary package is prepared for downstream booking and traveler communication.", "TableCell")],
    ]
    story.append(data_table(outcome_rows, [2.0 * inch, 4.65 * inch]))
    story.append(Spacer(1, 0.18 * inch))
    story.append(
        Table(
            [
                [
                    card("Best fit", "Corporate travel teams that need a controlled request lifecycle from manager upload to agent execution.", SOFT_TEAL, 3.25 * inch),
                    card("Clear scope", "Planning, review, recovery, approval visibility, and itinerary handoff. Existing booking and approval processes can remain in place.", SOFT_GOLD, 3.25 * inch),
                ]
            ],
            colWidths=[3.35 * inch, 3.35 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            ),
        )
    )
    return story


def main():
    doc = SimpleDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        rightMargin=0.58 * inch,
        leftMargin=0.58 * inch,
        topMargin=0.77 * inch,
        bottomMargin=0.58 * inch,
        title="Unipro Travel AI Client Brief",
        author="Unipro",
        subject="Client-facing Travel AI overview",
    )
    doc.build(build_story(), onFirstPage=cover, onLaterPages=header_footer)
    print(PDF_PATH)


if __name__ == "__main__":
    main()
