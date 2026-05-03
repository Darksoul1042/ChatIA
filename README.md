# ChatIA (Nova)

Aplicación de chat IA en React + Vite con estilo tipo asistentes modernos:
- Mensajes del usuario a la derecha.
- Mensajes de Nova a la izquierda.
- Burbujas de conversación.
- Soporte de streaming y fallback local para no quedarse sin respuesta.

## Requisitos
- Node.js 18+
- Una API Key de Anthropic

## Instalación
```bash
npm install
```

## Configuración
1. Copia el archivo de ejemplo:
```bash
cp .env.example .env
```
2. Edita `.env` y agrega tu key real:
```env
VITE_ANTHROPIC_API_KEY=tu_api_key_real
```

## Ejecutar en desarrollo
```bash
npm run dev
```

## Build de producción
```bash
npm run build
npm run preview
```

## Notas
- Si falta la API Key o falla la API, Nova responde con un fallback contextual para evitar respuestas vacías.

## Solución de problemas (npm 403)
Si durante `npm install` aparece `403 Forbidden`, normalmente es una restricción de red/política del entorno (CI, contenedor corporativo o mirror privado), no del código.

Prueba:
```bash
npm config set registry https://registry.npmjs.org/
npm cache clean --force
npm install
```

Si sigue fallando, ejecuta el proyecto en una red sin restricción o configura el registry interno autorizado por tu organización.


## Integración de API Key en código
Sí está integrada en `src/App.jsx` mediante `import.meta.env`:
- `VITE_ANTHROPIC_API_KEY` (recomendada)
- `VITE_API_KEY` (compatibilidad)

El request envía:
- `x-api-key`
- `anthropic-version`
- `anthropic-dangerous-direct-browser-access: true` (necesario al llamar directo desde navegador)
