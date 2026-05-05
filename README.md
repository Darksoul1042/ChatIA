# Nova AI

Nova AI es una app web de chat con inteligencia artificial creada con React, Vite y Firebase Auth. Incluye conversaciones persistentes en IndexedDB, inicio de sesion con Google, agentes/personas, razonamiento Fast/Heavy, carga de archivos, transcripcion de audio con Groq, generacion de imagenes, artefactos de codigo y exportaciones a PDF, Word, PowerPoint y Excel.

## Funciones

- Chat con memoria local por usuario.
- Inicio de sesion con Google mediante Firebase Authentication.
- Personas de IA para respuestas generales, codigo, ciencia, terapia y mas.
- Selector de razonamiento Fast/Heavy.
- Carga de PDF, Word, texto, codigo, CSV, JSON e imagenes.
- Transcripcion de audio `.mp3`, `.wav`, `.m4a`, `.ogg` y `.flac` usando Groq Whisper.
- Generacion de imagenes con Pollinations.
- Vista previa de artefactos HTML/SVG/XML generados por la IA.
- Exportacion de conversaciones a PDF, DOCX, PPTX y XLSX.
- Modo oscuro, busqueda de chats, chats fijados e importacion/exportacion de workspace.

## Requisitos

- Node.js 20 o superior.
- npm.
- Proyecto Firebase con Google Auth habilitado.
- Clave Groq opcional para chat avanzado y transcripcion de audio.

## Instalacion

```bash
npm install
cp .env.example .env.local
npm run dev
```

En Windows PowerShell puedes crear el archivo de entorno asi:

```powershell
Copy-Item .env.example .env.local
```

Luego abre `http://localhost:5173`.

## Variables De Entorno

Nova usa variables Vite para Firebase. Copia `.env.example` a `.env.local` y reemplaza los valores:

```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Estas claves son configuracion publica del cliente Firebase. No subas `.env.local` ni claves privadas al repositorio.

## Uso De Groq

La clave Groq no vive en el repo. Se ingresa desde la interfaz:

1. Inicia sesion en Nova.
2. Pulsa el boton `+`.
3. Selecciona `Llave Groq API`.
4. Pega una clave que empiece con `gsk_`.

Con Groq activo puedes usar modelos de chat compatibles y transcribir audios de hasta 25 MB.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## Despliegue En Vercel

1. Importa este repositorio en Vercel.
2. Configura las variables `VITE_FIREBASE_*` en Project Settings.
3. Usa `npm run build` como build command.
4. Usa `dist` como output directory.

## Seguridad

- `.env.local` esta ignorado por Git.
- `node_modules` y `dist` no se publican.
- Las claves Groq se guardan localmente en el navegador del usuario.
