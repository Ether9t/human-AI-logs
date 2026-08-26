import json
import re
from pathlib import Path

import pandas as pd
from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
from openpyxl.styles import Alignment


ROOT = Path(__file__).resolve().parent
USER_DATA = ROOT / "user_data"
OUTPUT = ROOT / "output"

EXCEL_CELL_LIMIT = 32767
TRUNCATION_MARKER = "\n\n[TRUNCATED FOR EXCEL]"

COLUMNS = [
    "Time",
    "Source",
    "Action",
    "Input",
    "Output",
]


def clean_excel_value(value):
    if not isinstance(value, str):
        return value

    value = ILLEGAL_CHARACTERS_RE.sub(
        "",
        value,
    )

    if value.startswith(
        ("=", "+", "-", "@")
    ):
        value = "'" + value

    if len(value) > EXCEL_CELL_LIMIT:
        max_content_length = (
            EXCEL_CELL_LIMIT
            - len(TRUNCATION_MARKER)
        )

        value = (
            value[:max_content_length]
            + TRUNCATION_MARKER
        )

    return value


def text(value):
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    return json.dumps(
        value,
        ensure_ascii=False,
    )


def read_log(path):
    records = []

    with path.open(
        "r",
        encoding="utf-8-sig",
        errors="replace",
    ) as file:

        for line_number, line in enumerate(
            file,
            start=1,
        ):
            line = line.strip()

            if not line:
                continue

            try:
                records.append(
                    json.loads(line)
                )

            except json.JSONDecodeError:
                print(
                    f"Warning: invalid JSON "
                    f"in {path.name}, "
                    f"line {line_number}"
                )

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
            value = text(
                item.get("text")
            )

            if value:
                parts.append(value)

    return "\n".join(parts)


def tool_result_text(content):
    if content is None:
        return ""

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []

        for item in content:
            if not isinstance(item, dict):
                continue

            if item.get("type") == "text":
                value = text(
                    item.get("text")
                )

                if value:
                    parts.append(value)

            else:
                value = text(item)

                if value:
                    parts.append(value)

        return "\n".join(parts)

    return text(content)


def parse_session_record(record):
    rows = []

    timestamp = record.get(
        "timestamp",
        "",
    )

    message = record.get(
        "message",
        {},
    )

    if isinstance(message, dict):
        role = message.get(
            "role",
            "",
        )

        content = message.get(
            "content"
        )

        normal_text = message_text(
            content
        )

        if normal_text and role == "user":
            rows.append([
                timestamp,
                "User",
                "Prompt",
                normal_text,
                "",
            ])

        elif normal_text and role == "assistant":
            rows.append([
                timestamp,
                "Assistant",
                "Response",
                "",
                normal_text,
            ])

        if isinstance(content, list):
            for item in content:
                if not isinstance(
                    item,
                    dict,
                ):
                    continue

                item_type = item.get(
                    "type"
                )

                if item_type == "tool_use":
                    tool_name = item.get(
                        "name",
                        "Tool",
                    )

                    tool_input = text(
                        item.get(
                            "input"
                        )
                    )

                    rows.append([
                        timestamp,
                        "Assistant",
                        tool_name,
                        "",
                        tool_input,
                    ])

                elif item_type == "tool_result":
                    result_output = (
                        tool_result_text(
                            item.get(
                                "content"
                            )
                        )
                    )

                    if result_output:
                        rows.append([
                            timestamp,
                            "Tool",
                            "Result",
                            "",
                            result_output,
                        ])

    tool_result = record.get(
        "toolUseResult"
    )

    if isinstance(
        tool_result,
        dict,
    ):
        outputs = []

        stdout = tool_result.get(
            "stdout"
        )

        stderr = tool_result.get(
            "stderr"
        )

        if stdout:
            outputs.append(
                text(stdout)
            )

        if stderr:
            outputs.append(
                "[stderr]\n"
                + text(stderr)
            )

        file_info = tool_result.get(
            "file",
            {},
        )

        if isinstance(
            file_info,
            dict,
        ):
            file_content = file_info.get(
                "content"
            )

            if file_content:
                outputs.append(
                    text(file_content)
                )

        output = "\n".join(
            outputs
        )

        if output:
            rows.append([
                timestamp,
                "Tool",
                "Result",
                "",
                output,
            ])

    return rows


def parse_live_record(record):
    rows = []

    source = record.get(
        "source",
        "",
    )

    if source == "participant":
        record_type = record.get(
            "type",
            "",
        )

        if record_type == "user_message":
            user_text = text(
                record.get(
                    "text"
                )
            )

            timestamp = record.get(
                "timestamp",
                "",
            )

            if user_text:
                rows.append([
                    timestamp,
                    "User",
                    "Prompt",
                    user_text,
                    "",
                ])

        return rows

    if source != "claude":
        return rows

    event = record.get(
        "event",
        {},
    )

    if not isinstance(
        event,
        dict,
    ):
        return rows

    event_type = event.get(
        "type",
        "",
    )

    timestamp = event.get(
        "timestamp",
        "",
    )

    if event_type in {
        "stream_event",
        "system",
    }:
        return rows

    if event_type == "assistant":
        message = event.get(
            "message",
            {},
        )

        if not isinstance(
            message,
            dict,
        ):
            return rows

        content = message.get(
            "content"
        )

        if not isinstance(
            content,
            list,
        ):
            return rows

        for item in content:
            if not isinstance(
                item,
                dict,
            ):
                continue

            item_type = item.get(
                "type"
            )

            if item_type == "text":
                value = text(
                    item.get(
                        "text"
                    )
                )

                if value:
                    rows.append([
                        timestamp,
                        "Assistant",
                        "Response",
                        "",
                        value,
                    ])

            elif item_type == "tool_use":
                tool_name = item.get(
                    "name",
                    "Tool",
                )

                tool_input = text(
                    item.get(
                        "input"
                    )
                )

                rows.append([
                    timestamp,
                    "Assistant",
                    tool_name,
                    "",
                    tool_input,
                ])

        return rows

    if event_type == "user":
        message = event.get(
            "message",
            {},
        )

        if not isinstance(
            message,
            dict,
        ):
            return rows

        content = message.get(
            "content"
        )

        if not isinstance(
            content,
            list,
        ):
            return rows

        for item in content:
            if not isinstance(
                item,
                dict,
            ):
                continue

            if item.get(
                "type"
            ) == "tool_result":

                result_output = (
                    tool_result_text(
                        item.get(
                            "content"
                        )
                    )
                )

                if result_output:
                    rows.append([
                        timestamp,
                        "Tool",
                        "Result",
                        "",
                        result_output,
                    ])

    return rows


def get_log_files(folder):
    all_files = sorted(
        path
        for path in folder.glob(
            "*.jsonl"
        )
        if path.is_file()
    )

    normal_files = [
        path
        for path in all_files
        if not path.name
        .lower()
        .startswith("live-")
    ]

    if normal_files:
        return normal_files

    live_files = [
        path
        for path in all_files
        if path.name
        .lower()
        .startswith("live-")
    ]

    if live_files:
        print(
            f"Fallback to live log: "
            f"{folder}"
        )

    return live_files


def folder_dataframe(folder):
    rows = []

    log_files = get_log_files(
        folder
    )

    for path in log_files:
        records = read_log(
            path
        )

        is_live = (
            path.name
            .lower()
            .startswith("live-")
        )

        for record in records:
            if is_live:
                rows.extend(
                    parse_live_record(
                        record
                    )
                )
            else:
                rows.extend(
                    parse_session_record(
                        record
                    )
                )

    dataframe = pd.DataFrame(
        rows,
        columns=COLUMNS,
    )

    if not dataframe.empty:
        dataframe = dataframe.map(
            clean_excel_value
        )

    return dataframe


def sheet_name(name):
    name = re.sub(
        r"[\[\]:*?/\\]",
        "_",
        name,
    )

    return name[:31]


def get_task_folders(p_folder):
    logs_folder = (
        p_folder
        / "logs"
    )

    if not logs_folder.exists():
        return []

    task_folders = []

    for group_folder in sorted(
        logs_folder.iterdir()
    ):
        if not group_folder.is_dir():
            continue

        for task_folder in sorted(
            group_folder.iterdir()
        ):
            if not task_folder.is_dir():
                continue

            log_files = get_log_files(
                task_folder
            )

            if not log_files:
                continue

            task_folders.append(
                (
                    group_folder.name,
                    task_folder,
                )
            )

    return task_folders


def export_p_folder(p_folder):
    output_path = (
        OUTPUT
        / f"{p_folder.name}.xlsx"
    )

    task_folders = get_task_folders(
        p_folder
    )

    if not task_folders:
        print(
            f"No valid log folders "
            f"found in {p_folder.name}"
        )
        return

    used_names = set()

    with pd.ExcelWriter(
        output_path,
        engine="openpyxl",
    ) as writer:

        for (
            group_id,
            task_folder,
        ) in task_folders:

            dataframe = (
                folder_dataframe(
                    task_folder
                )
            )

            relative_name = (
                f"{group_id}_"
                f"{task_folder.name}"
            )

            tab_name = sheet_name(
                relative_name
            )

            original_name = tab_name
            counter = 1

            while (
                tab_name.lower()
                in used_names
            ):
                suffix = (
                    f"_{counter}"
                )

                tab_name = (
                    original_name[
                        :31 - len(suffix)
                    ]
                    + suffix
                )

                counter += 1

            used_names.add(
                tab_name.lower()
            )

            dataframe.to_excel(
                writer,
                sheet_name=tab_name,
                index=False,
            )

            worksheet = writer.sheets[
                tab_name
            ]

            worksheet.column_dimensions[
                "A"
            ].width = 28

            worksheet.column_dimensions[
                "B"
            ].width = 12

            worksheet.column_dimensions[
                "C"
            ].width = 18

            worksheet.column_dimensions[
                "D"
            ].width = 80

            worksheet.column_dimensions[
                "E"
            ].width = 80

            for row in worksheet.iter_rows():
                for cell in row:
                    cell.alignment = Alignment(
                        vertical="top",
                        wrap_text=True,
                    )

            print(
                f"{p_folder.name}/"
                f"{group_id}/"
                f"{task_folder.name}: "
                f"{len(dataframe)} rows"
            )

    print(
        f"Created: {output_path}"
    )


def main():
    OUTPUT.mkdir(
        exist_ok=True
    )

    if not USER_DATA.exists():
        raise FileNotFoundError(
            f"user_data folder "
            f"not found: "
            f"{USER_DATA}"
        )

    p_folders = [
        folder
        for folder
        in USER_DATA.iterdir()
        if (
            folder.is_dir()
            and re.fullmatch(
                r"P\d+",
                folder.name,
                re.I,
            )
        )
    ]

    p_folders.sort(
        key=lambda path: int(
            path.name[1:]
        )
    )

    if not p_folders:
        print(
            "No participant folders "
            "found in user_data."
        )
        return

    for folder in p_folders:
        export_p_folder(
            folder
        )


if __name__ == "__main__":
    main()