---
title: Sale Report Remove BG API
emoji: 🖼️
colorFrom: orange
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# Sale Report Remove BG API

FastAPI backend for removing seller image backgrounds with Python `rembg`.

## Endpoints

- `GET /health`
- `POST /remove-background`

## Local frontend config

After deploying this Space, update `config.js`:

```js
window.APP_CONFIG = {
  PYTHON_API_URL: "https://YOUR_USERNAME-YOUR_SPACE_NAME.hf.space/remove-background",
};
```
