# Paymentflow

React single-page application bootstrapped with Vite.

## Local development

```bash
npm install
npm run dev
```

### Environment variables

The frontend reads its configuration from Vite-style `VITE_*` variables. Create a local `.env` with the keys below before running dev/build commands:

| Variable | Description |
| --- | --- |
| `VITE_BASIC_USER` / `VITE_BASIC_PASS` | Credentials for `getBearerToken` requests. |
| `VITE_DEFAULT_CALLBACK_URL` | Full URL the payment provider should POST webhooks to (e.g. `https://your-domain/api/v1/callback`). |
| `VITE_CALLBACK_BASE` | Base origin used by the UI when polling `/api/v1/callback/latest`. Leave empty to reuse the origin of `VITE_DEFAULT_CALLBACK_URL` or the current site. |
| `VITE_CALLBACK_POLL_INTERVAL_MS` | Optional override for the webhook polling interval (defaults to 2000). |

When targeting an ngrok or production domain, make sure both `VITE_DEFAULT_CALLBACK_URL` and `VITE_CALLBACK_BASE` point at the same host that runs `server.js` so the UI can both receive and poll callbacks successfully.

## Production build

```bash
npm run build
npm run preview
```

## Docker

### Build the image

```bash
docker build -t paymentflow:latest .
```

### Run the container

```bash
docker run -d -p 3001:80 --name paymentflow-container paymentflow:latest
```

The application is served from Nginx and will be available at http://localhost:3001.

### Using Docker Compose

```bash
docker compose up --build
```

This command maps the container to http://localhost:3000 and rebuilds the image whenever the Dockerfile or dependencies change.
 // "dev": "bash -c \"npm run server:dev & vite\"",