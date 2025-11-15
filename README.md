# Paymentflow

React single-page application bootstrapped with Vite.

## Local development

```bash
npm install
npm run dev
```

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