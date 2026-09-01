import os
import pandas as pd
from collections import Counter

FILE_PATH = "label/Participant.xlsx"
OUTPUT_PATH = "label/Results.xlsx"
EXCLUDE_SHEETS = ["Example", "Summary"]
VALID_ACTIONS = ["Prompt", "Response"]
ACTION_COL = "Action"
OPEN_CODE_COL = "Open Code"

CODE_MAPPING = {
    "Information Seeking": [
        "Requesting direct answer",
        "Requesting information",
    ],
    "Understanding": [
        "Requesting clarification",
        "Requesting justification",
    ],
    "Challenge": [
        "Challenging the agent",
        "Proposing an alternative",
    ],
    "Verification": [
        "Requesting re-analysis",
        "Requesting result verification",
        "Requesting data validation",
        "Requesting assumption validation",
    ],
    "Reliance / Decision": [
        "Accepting the answer",
        "Accepting a flawed answer",
        "Proceeding without resolving concern",
    ],
    "Agent Behavior": [
        "Relying on pre-existing analysis",
        "Exposing an assumption",
        "Identifying an issue",
        "Correcting the result",
    ],
}

CODE_TO_CATEGORY = {
    code: category
    for category, codes in CODE_MAPPING.items()
    for code in codes
}

def parse_codes(value):
    if pd.isna(value):
        return []
    return [
        code.strip()
        for code in str(value).split(",")
        if code.strip()
    ]

def calculate_summary(df):
    all_codes = [
        code
        for codes in df["Parsed Codes"]
        for code in codes
        if code in CODE_TO_CATEGORY
    ]

    total_code_count = len(all_codes)

    code_counts = Counter(all_codes)

    small_code_rows = []

    for category, codes in CODE_MAPPING.items():
        for code in codes:
            count = code_counts.get(code, 0)

            small_code_rows.append({
                "Category": category,
                "Open Code": code,
                "Count": count,
                "Percent": count / total_code_count if total_code_count > 0 else 0,
            })

    small_code_summary = pd.DataFrame(small_code_rows)

    category_counts = Counter(
        CODE_TO_CATEGORY[code]
        for code in all_codes
    )

    category_rows = []

    for category in CODE_MAPPING:
        count = category_counts.get(category, 0)

        category_rows.append({
            "Category": category,
            "Count": count,
            "Percent": count / total_code_count if total_code_count > 0 else 0,
        })

    category_summary = pd.DataFrame(category_rows)

    return category_summary, small_code_summary, total_code_count

excel = pd.ExcelFile(FILE_PATH)

sheets = [
    sheet
    for sheet in excel.sheet_names
    if sheet not in EXCLUDE_SHEETS
]

dfs = []

for sheet in sheets:
    df = pd.read_excel(FILE_PATH, sheet_name=sheet)
    df.columns = df.columns.astype(str).str.strip()

    if ACTION_COL not in df.columns or OPEN_CODE_COL not in df.columns:
        continue

    df[ACTION_COL] = df[ACTION_COL].astype(str).str.strip()
    df = df[df[ACTION_COL].isin(VALID_ACTIONS)].copy()
    df["Sheet"] = sheet
    dfs.append(df)

data = pd.concat(dfs, ignore_index=True)
data["Parsed Codes"] = data[OPEN_CODE_COL].apply(parse_codes)

overall_category, overall_codes, overall_n = calculate_summary(data)

user_data = data[data[ACTION_COL] == "Prompt"].copy()
user_category, user_codes, user_n = calculate_summary(user_data)

ai_data = data[data[ACTION_COL] == "Response"].copy()
ai_category, ai_codes, ai_n = calculate_summary(ai_data)

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with pd.ExcelWriter(OUTPUT_PATH, engine="openpyxl") as writer:
    sheet_name = "Summary"

    sections = [
        ("Overall", overall_category, overall_codes, overall_n),
        ("User (Prompt)", user_category, user_codes, user_n),
        ("AI (Response)", ai_category, ai_codes, ai_n),
    ]

    start_row = 0

    for title, category_summary, code_summary, n_rows in sections:
        pd.DataFrame({
            f"{title} - N = {n_rows}": [""]
        }).to_excel(
            writer,
            sheet_name=sheet_name,
            index=False,
            startrow=start_row,
            startcol=0
        )

        table_start = start_row + 2

        category_summary.to_excel(
            writer,
            sheet_name=sheet_name,
            index=False,
            startrow=table_start,
            startcol=0
        )

        code_summary.to_excel(
            writer,
            sheet_name=sheet_name,
            index=False,
            startrow=table_start,
            startcol=4
        )

        section_height = max(
            len(category_summary),
            len(code_summary)
        ) + 1

        start_row = table_start + section_height + 1

    ws = writer.book[sheet_name]

    for row in ws.iter_rows():
        for cell in row:
            if cell.column in [3, 8] and isinstance(cell.value, float):
                cell.number_format = "0.00%"

print(f"Saved to: {OUTPUT_PATH}")