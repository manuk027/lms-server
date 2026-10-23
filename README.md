# Library Management Server

The API server is built with Node.js, Express, and TypeScript. It includes a health endpoint and an optional MongoDB Atlas connection, and is structured to grow into feature-based API modules.

## Requirements

- Node.js 20 or newer
- npm
- MongoDB Atlas connection string (optional for the current health-only starter)

## Local development

```sh
npm install
cp .env.example .env
npm run dev
```

The server listens on `http://localhost:4000` by default. When `MONGODB_URI` is set, it connects to MongoDB before accepting requests. Without it, the API starts without a database connection.

## Environment variables

| Variable | Description | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `4000` |
| `MONGODB_URI` | MongoDB Atlas connection string | unset |
| `FRONTEND_ORIGIN` | Allowed browser origin for CORS | `http://localhost:5173` |
| `NODE_ENV` | Runtime environment | unset |

Keep credentials in local `.env` or the hosting provider's secret settings. Do not commit populated environment files.

## Available scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the API with TypeScript watch mode |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run the compiled server |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Check that the API process is running |

## Render deployment

Create a Render Web Service from this repository and set its root directory to the repository root. Use `npm install && npm run build` for the build command and `npm start` for the start command. Configure `MONGODB_URI`, `FRONTEND_ORIGIN` (the deployed Vercel URL), and any other environment variables in Render. Render supplies the service port through `PORT`.

## Current scope

This is a server scaffold. Book, copy, user, and loan routes; Firebase token verification; and MongoDB models will be added as the application features are implemented.
