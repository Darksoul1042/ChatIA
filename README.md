# ChatIA (Nova)

Chat IA con frontend React+Vite y backend Express para proteger tu API Key.

## 1) Configuración
```bash
cp .env.example .env
```
En `.env` agrega:
```env
ANTHROPIC_API_KEY=tu_api_key_real
```

## 2) Instalar
```bash
npm install
```

## 3) Ejecutar frontend + backend
```bash
npm run dev:full
```
- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8787`

## Scripts
- `npm run dev` -> solo frontend
- `npm run server` -> solo backend
- `npm run dev:full` -> ambos

## Nota de seguridad
La key ya no se expone en `VITE_*`; ahora vive solo en backend (`ANTHROPIC_API_KEY`).
