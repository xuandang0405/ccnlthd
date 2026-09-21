import re
import shutil
import zipfile
from pathlib import Path
from typing import BinaryIO

from docx import Document as DocxDocument
from openpyxl import load_workbook
from pypdf import PdfReader


class UnsafeDocumentError(ValueError):
    pass


MIME_BY_EXTENSION = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def save_limited(source: BinaryIO, destination: Path, maximum: int) -> int:
    destination.parent.mkdir(parents=True, exist_ok=True)
    written = 0
    try:
        with destination.open("xb") as target:
            while chunk := source.read(64 * 1024):
                written += len(chunk)
                if written > maximum:
                    raise UnsafeDocumentError(f"File vượt quá giới hạn {maximum} byte")
                target.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    if written == 0:
        destination.unlink(missing_ok=True)
        raise UnsafeDocumentError("File rỗng")
    return written


def _validate_zip(path: Path, required_member: str) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            if required_member not in names or "[Content_Types].xml" not in names:
                raise UnsafeDocumentError("Cấu trúc Office Open XML không hợp lệ")
            total_uncompressed = 0
            for item in archive.infolist():
                total_uncompressed += item.file_size
                if total_uncompressed > 100 * 1024 * 1024:
                    raise UnsafeDocumentError("Tài liệu nén có kích thước giải nén bất thường")
                if item.compress_size and item.file_size / item.compress_size > 200:
                    raise UnsafeDocumentError("Phát hiện tỷ lệ nén bất thường")
    except zipfile.BadZipFile as exc:
        raise UnsafeDocumentError("File Office bị hỏng hoặc không đúng định dạng") from exc


def validate_structure(path: Path, extension: str) -> str:
    extension = extension.lower()
    if extension not in MIME_BY_EXTENSION:
        raise UnsafeDocumentError("Chỉ hỗ trợ PDF, DOCX và XLSX")
    if extension == ".pdf":
        with path.open("rb") as stream:
            if stream.read(5) != b"%PDF-":
                raise UnsafeDocumentError("File không có cấu trúc PDF hợp lệ")
        try:
            PdfReader(path, strict=True)
        except Exception as exc:
            raise UnsafeDocumentError("File PDF bị hỏng hoặc không đọc được") from exc
    elif extension == ".docx":
        _validate_zip(path, "word/document.xml")
    else:
        _validate_zip(path, "xl/workbook.xml")
    return MIME_BY_EXTENSION[extension]


def normalize_text(value: str) -> str:
    value = value.replace("\x00", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def parse_pdf(path: Path, max_pages: int) -> str:
    reader = PdfReader(path, strict=True)
    if len(reader.pages) > max_pages:
        raise UnsafeDocumentError(f"PDF vượt quá giới hạn {max_pages} trang")
    return normalize_text("\n".join(page.extract_text() or "" for page in reader.pages))


def parse_docx(path: Path) -> str:
    document = DocxDocument(path)
    lines = [paragraph.text for paragraph in document.paragraphs if paragraph.text.strip()]
    for table in document.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells]
            if any(values):
                lines.append(" | ".join(values))
    return normalize_text("\n".join(lines))


def parse_xlsx(path: Path, max_cells: int) -> str:
    workbook = load_workbook(path, read_only=True, data_only=True, keep_links=False)
    lines: list[str] = []
    cells_seen = 0
    try:
        for sheet in workbook.worksheets:
            lines.append(f"[Trang tính: {sheet.title}]")
            for row in sheet.iter_rows(values_only=True):
                cells_seen += len(row)
                if cells_seen > max_cells:
                    raise UnsafeDocumentError(f"XLSX vượt quá giới hạn xử lý {max_cells} ô")
                values = [str(value).strip() for value in row if value is not None]
                if values:
                    lines.append(" | ".join(values))
    finally:
        workbook.close()
    return normalize_text("\n".join(lines))


def parse_document(path: Path, extension: str, max_pages: int, max_cells: int) -> str:
    if extension == ".pdf":
        text = parse_pdf(path, max_pages)
    elif extension == ".docx":
        text = parse_docx(path)
    elif extension == ".xlsx":
        text = parse_xlsx(path, max_cells)
    else:
        raise UnsafeDocumentError("Định dạng không được hỗ trợ")
    if not text:
        raise UnsafeDocumentError("Không trích xuất được nội dung văn bản")
    return text


def chunks(text: str, target_size: int = 1400, overlap: int = 180) -> list[str]:
    paragraphs = [part.strip() for part in text.split("\n") if part.strip()]
    result: list[str] = []
    current = ""
    for paragraph in paragraphs:
        if current and len(current) + len(paragraph) + 1 > target_size:
            result.append(current)
            current = f"{current[-overlap:]}\n{paragraph}"
        else:
            current = f"{current}\n{paragraph}".strip()
    if current:
        result.append(current)
    return result


def safe_remove(path: Path) -> None:
    if path.is_file():
        path.unlink()
    elif path.exists():
        shutil.rmtree(path)
