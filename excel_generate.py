import json
import re
from pathlib import Path
import pandas as pd
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE


ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "output"

COLUMNS = [
    "Time",
    "Actor",
    "Action",
    "Target",
    "Input",
    "Output",
    "DurationMs",
    "Files",
]


def clean_excel_value(value):
    if isinstance(value, str):
        return ILLEGAL_CHARACTERS_RE.sub("", value)

    return value


def text(value):
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return json.dumps(value, ensure_ascii=False)


def read_jsonl(path):
    records = []

    with path.open("r", encoding="utf-8-sig", errors="replace") as file:
        for line in file:
            line = line.strip()

            if not line:
                continue

            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                pass

    return records


def message_text(content):
    if isinstance(content, str):
        return content.strip()

    if not isinstance(content, list):
        return ""

    parts = []

    for item in content:
        if not isinstance(item, dict):
            continue

        if item.get("type") == "text":
            value = text(item.get("text"))

            if value:
                parts.append(value)

    return "\n".join(parts)


def parse_record(record):
    rows = []
    timestamp = record.get("timestamp", "")
    message = record.get("message", {})

    if isinstance(message, dict):
        role = message.get("role", "")
        content = message.get("content")

        normal_text = message_text(content)

        if normal_text:
            if role == "user":
                rows.append([
                    timestamp,
                    "User",
                    "Prompt",
                    "Chat",
                    normal_text,
                    "",
                    "",
                    "",
                ])

            elif role == "assistant":
                rows.append([
                    timestamp,
                    "Assistant",
                    "Response",
                    "Chat",
                    "",
                    normal_text,
                    "",
                    "",
                ])

        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue

                item_type = item.get("type")

                if item_type == "tool_use":
                    rows.append([
                        timestamp,
                        "Assistant",
                        "Tool Call",
                        item.get("name", "Tool"),
                        text(item.get("input")),
                        "",
                        "",
                        "",
                    ])

                elif item_type == "tool_result":
                    rows.append([
                        timestamp,
                        "Tool",
                        "Tool Result",
                        item.get("tool_use_id", "Tool"),
                        "",
                        text(item.get("content")),
                        "",
                        "",
                    ])

    tool_result = record.get("toolUseResult")

    if isinstance(tool_result, dict):
        outputs = []

        if tool_result.get("stdout"):
            outputs.append(text(tool_result["stdout"]))

        if tool_result.get("stderr"):
            outputs.append(
                "[stderr]\n" + text(tool_result["stderr"])
            )

        file_info = tool_result.get("file", {})

        if isinstance(file_info, dict) and file_info.get("content"):
            outputs.append(text(file_info["content"]))

        files = tool_result.get("filenames", [])

        if not isinstance(files, list):
            files = [files]

        if isinstance(file_info, dict) and file_info.get("filePath"):
            files.append(file_info["filePath"])

        files = "\n".join(
            str(file)
            for file in files
            if file
        )

        output = "\n".join(outputs)

        if output or files:
            rows.append([
                timestamp,
                "Tool",
                "Tool Result",
                tool_result.get("type", "Tool"),
                "",
                output,
                tool_result.get(
                    "durationMs",
                    record.get("durationMs", ""),
                ),
                files,
            ])

    return rows


def folder_dataframe(folder):
    rows = []

    for path in sorted(folder.glob("*.jsonl")):
        for record in read_jsonl(path):
            rows.extend(parse_record(record))

    dataframe = pd.DataFrame(
        rows,
        columns=COLUMNS,
    )

    if not dataframe.empty:
        dataframe = (
            dataframe
            .drop_duplicates()
            .sort_values(
                "Time",
                na_position="last",
            )
            .reset_index(drop=True)
        )

        dataframe = dataframe.map(
            clean_excel_value
        )

    return dataframe


def sheet_name(name):
    parts = name.split("-")
    if len(parts) >= 2:
        name = "-".join(parts[-2:])

    return re.sub(r"[\[\]:*?/\\]", "_", name)[:31]


def export_p_folder(p_folder):
    output_path = OUTPUT / f"{p_folder.name}.xlsx"
    subfolders = sorted({
        path.parent
        for path in p_folder.rglob("*.jsonl")
    })

    if not subfolders:
        print(f"No JSONL folders found in {p_folder.name}")
        return

    used_names = set()

    with pd.ExcelWriter(
        output_path,
        engine="openpyxl",
    ) as writer:

        for folder in subfolders:
            dataframe = folder_dataframe(folder)
            relative_name = str(
                folder.relative_to(p_folder)
            ).replace("\\", "_").replace("/", "_")

            tab_name = sheet_name(relative_name)
            original_name = tab_name
            counter = 1

            while tab_name.lower() in used_names:
                suffix = f"_{counter}"
                tab_name = original_name[:31 - len(suffix)] + suffix
                counter += 1

            used_names.add(tab_name.lower())

            dataframe.to_excel(
                writer,
                sheet_name=tab_name,
                index=False,
            )

            print(
                f"{p_folder.name}/{relative_name}: "
                f"{len(dataframe)} rows"
            )

    print(f"Created: {output_path}")


def main():
    OUTPUT.mkdir(exist_ok=True)

    p_folders = [
        folder
        for folder in ROOT.iterdir()
        if folder.is_dir()
        and re.fullmatch(r"P\d+", folder.name, re.I)
    ]

    p_folders.sort(
        key=lambda path: int(path.name[1:])
    )

    for folder in p_folders:
        export_p_folder(folder)


if __name__ == "__main__":
    main()