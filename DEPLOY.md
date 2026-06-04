# Deployment guide — Make the app available online

This repository contains a small Node.js static server (server.js) that serves the frontend (INDEX.html, SCRIPT.js, STYLE.css) and persists data to server-data/db.json. Below are easy ways to deploy this project so it is accessible online.

## Option A — Render (recommended)
1. Sign up at https://render.com and connect your GitHub account.
2. Create a new "Web Service".
   - Choose this repository (`AkarshanMishra/mrreport`).
   - Environment: **Docker** (Render will build the Dockerfile) or **Node** (build and run `node server.js`).
   - Set the `PORT` environment variable to `3000` (Render usually provides one automatically as `$PORT`).
   - For Docker, Render will build and run the container directly.
3. Deploy. Render will provide a public URL where the app will be available.

Notes:
- The server persists data to `server-data/db.json` inside the container. For persistent storage across deployments, configure a persistent disk on Render or use an external DB.

## Option B — Railway
1. Sign up at https://railway.app and connect your GitHub account.
2. Create a new project and link this repository.
3. Railway detects Node/Docker and runs your app. Ensure the service listens on the `PORT` environment variable.
4. Deploy and use the provided URL.

## Option C — Docker on any cloud or VPS
1. Build the image locally:
   ```bash
   docker build -t mrreport:latest .
   ```
2. Run it locally:
   ```bash
   docker run -p 3000:3000 -v $(pwd)/server-data:/app/server-data mrreport:latest
   ```
   - Mounting `server-data` keeps db.json persisted on your host.
3. Push the image to a registry (Docker Hub, GitHub Container Registry) and deploy to your cloud provider.

## Option D — GitHub Actions + Cloud (advanced)
- You can add workflows that build and publish a Docker image to a registry, then deploy to your host. This requires credentials (secrets) for the target platform/registry.

## Quick local start
```bash
git clone https://github.com/AkarshanMishra/mrreport.git
cd mrreport
# (optional) copy bundled db.json into server-data so initial data is preserved
mkdir -p server-data
cp db.json server-data/db.json || true
node server.js
# open http://localhost:3000
```

## Notes & Recommendations
- The server creates `server-data/db.json` automatically. If you want initial data to be present on first deploy, copy `db.json` into `server-data/db.json` in the repository (or use a start script to copy if missing).
- If you want a fully managed persistent backend, consider connecting a small managed database (Postgres/SQLite on a persistent volume) and updating the server to use it.

If you want, I can:
- Add a `start` script and a simple `package.json`.
- Add a GitHub Action that builds the Docker image and publishes it to GitHub Container Registry.
- Create a `render.yaml` or sample Render/GCP/AWS configuration for 1-click deployment.

Tell me which option you prefer and I will implement the required files or create the GitHub Actions workflow for deployment.