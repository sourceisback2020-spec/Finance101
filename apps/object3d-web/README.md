# Object 3D Web App

Standalone React + Three.js app that generates a 3D model from a text prompt using the Meshy API.

## Run locally

1. Copy `env.example` to `.env` and set your key:
   - `MESHY_API_KEY=...`
2. Install dependencies:
   - `npm install --prefix apps/object3d-web`
3. Start web app + proxy:
   - `npm run dev:object3d`
4. Open:
   - `http://localhost:5174`

## Production-style run

- Build frontend:
  - `npm run build:object3d`
- Preview frontend:
  - `npm run preview:object3d`
- Run API proxy:
  - `npm run start:object3d:api`

Set `VITE_API_BASE_URL` if your preview host does not route `/api/meshy` to the proxy.

## Notes

- The app starts a Meshy text-to-3D task (`mode=preview`) and polls status until completion.
- The resulting model URL is loaded with Three.js (`GLTFLoader`) and can be opened or downloaded.
- API keys remain server-side in `server/proxy.ts`.


