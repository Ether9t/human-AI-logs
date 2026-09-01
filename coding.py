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

total_rows = len(data)

all_codes = [
    code
    for codes in data["Parsed Codes"]
    for code in codes
]

code_counts = Counter(all_codes)

small_code_rows = []

for category, codes in CODE_MAPPING.items():
    for code in codes:
        count = code_counts.get(code, 0)

        small_code_rows.append({
            "Category": category,
            "Open Code": code,
            "Count": count,
            "Percent": count / total_rows if total_rows > 0 else 0,
        })

small_code_summary = pd.DataFrame(small_code_rows)

category_counts = Counter()

for codes in data["Parsed Codes"]:
    categories_in_row = {
        CODE_TO_CATEGORY[code]
        for code in codes
        if code in CODE_TO_CATEGORY
    }

    for category in categories_in_row:
        category_counts[category] += 1

category_rows = []

for category in CODE_MAPPING:
    count = category_counts.get(category, 0)

    category_rows.append({
        "Category": category,
        "Count": count,
        "Percent": count / total_rows if total_rows > 0 else 0,
    })

category_summary = pd.DataFrame(category_rows)

os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)

with pd.ExcelWriter(OUTPUT_PATH, engine="openpyxl") as writer:
    category_summary.to_excel(
        writer,
        sheet_name="Summary",
        index=False,
        startrow=0,
        startcol=0
    )

    small_code_summary.to_excel(
        writer,
        sheet_name="Summary",
        index=False,
        startrow=0,
        startcol=4
    )

    ws = writer.book["Summary"]

    for cell in ws["C"][1:]:
        if isinstance(cell.value, float):
            cell.number_format = "0.00%"

    for cell in ws["H"][1:]:
        if isinstance(cell.value, float):
            cell.number_format = "0.00%"

print(f"Saved to: {OUTPUT_PATH}")