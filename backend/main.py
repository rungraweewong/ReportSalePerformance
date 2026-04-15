from io import BytesIO
import os
from pathlib import Path
import re

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from PIL import Image, UnidentifiedImageError

os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/numba-cache")

from rembg import remove


MAX_FILE_SIZE = 8 * 1024 * 1024
UPLOAD_ROOT = Path(os.getenv("UPLOAD_ROOT", Path(__file__).resolve().parent / "uploads"))
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,80}$")
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}


def normalize_username(username: str) -> str:
    normalized = username.strip()

    if not USERNAME_PATTERN.fullmatch(normalized):
        raise HTTPException(
            status_code=400,
            detail="Username must be 3-80 characters and contain only letters, numbers, dot, underscore, or hyphen",
        )

    return normalized


def validate_image_bytes(file: UploadFile, input_bytes: bytes) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    if not input_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(input_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 8MB")

    try:
        Image.open(BytesIO(input_bytes)).verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc


def remove_background_bytes(input_bytes: bytes) -> bytes:
    try:
        return remove(input_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Background removal failed") from exc


def build_user_image_response(username: str) -> JSONResponse:
    user_dir = UPLOAD_ROOT / username
    image_path = user_dir / f"{username}.png"

    if not image_path.exists():
        return JSONResponse({"username": username, "exists": False, "images": []})

    image_url = f"/users/{username}/{username}.png"
    return JSONResponse(
        {
            "username": username,
            "exists": True,
            "images": [
                {
                    "fileName": image_path.name,
                    "url": image_url,
                    "size": image_path.stat().st_size,
                }
            ],
        }
    )


app = FastAPI(title="Sale Report Background Removal API")

allowed_origins = os.getenv("ALLOWED_ORIGINS", "*")
origins = [origin.strip() for origin in allowed_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@app.post("/remove-background")
async def remove_background(file: UploadFile = File(...)) -> Response:
    input_bytes = await file.read()
    validate_image_bytes(file, input_bytes)
    output_bytes = remove_background_bytes(input_bytes)

    download_name = f"{os.path.splitext(file.filename)[0]}-no-bg.png"
    headers = {"Content-Disposition": f'inline; filename="{download_name}"'}
    return Response(content=output_bytes, media_type="image/png", headers=headers)


@app.post("/register")
async def register_user(username: str = Form(...), file: UploadFile = File(...)) -> JSONResponse:
    normalized_username = normalize_username(username)
    input_bytes = await file.read()
    validate_image_bytes(file, input_bytes)
    output_bytes = remove_background_bytes(input_bytes)

    user_dir = UPLOAD_ROOT / normalized_username
    user_dir.mkdir(parents=True, exist_ok=True)
    output_path = user_dir / f"{normalized_username}.png"
    output_path.write_bytes(output_bytes)

    return build_user_image_response(normalized_username)


@app.get("/users/{username}")
async def get_user(username: str) -> JSONResponse:
    normalized_username = normalize_username(username)
    return build_user_image_response(normalized_username)


@app.get("/users/{username}/{filename}")
async def get_user_image(username: str, filename: str) -> FileResponse:
    normalized_username = normalize_username(username)
    expected_filename = f"{normalized_username}.png"

    if filename != expected_filename:
        raise HTTPException(status_code=404, detail="Image not found")

    image_path = UPLOAD_ROOT / normalized_username / expected_filename

    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(image_path, media_type="image/png", filename=expected_filename)
