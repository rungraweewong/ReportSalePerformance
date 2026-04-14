from io import BytesIO
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from PIL import Image, UnidentifiedImageError
from rembg import remove


MAX_FILE_SIZE = 8 * 1024 * 1024
ALLOWED_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
}


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
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file name")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    input_bytes = await file.read()

    if not input_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    if len(input_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 8MB")

    try:
        Image.open(BytesIO(input_bytes)).verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Invalid image file") from exc

    try:
        output_bytes = remove(input_bytes)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Background removal failed") from exc

    download_name = f"{os.path.splitext(file.filename)[0]}-no-bg.png"
    headers = {"Content-Disposition": f'inline; filename="{download_name}"'}
    return Response(content=output_bytes, media_type="image/png", headers=headers)
