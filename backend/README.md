# Python API for Background Removal

This folder contains the backend API for seller-image background removal.

## Local run

```bash
cd /Users/rungrawee/Desktop/work/Codex/ReportSalePerformanceProject/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 9000
```

Open the health check:

```text
http://localhost:9000/health
```

## API endpoint

`POST /remove-background`

Form data:

- `file`: image file (`png`, `jpg`, `jpeg`, `webp`, `gif`)

Response:

- `image/png`

## Example curl

```bash
curl -X POST http://localhost:9000/remove-background \
  -F "file=@/absolute/path/to/person.jpg" \
  --output person-no-bg.png
```

## Koyeb

Build command:

```bash
pip install -r backend/requirements.txt
```

Run command:

```bash
cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT
```
