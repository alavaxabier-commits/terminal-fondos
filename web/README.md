# Web

React + TypeScript + Tailwind (Vite). Se publica en Cloudflare Pages desde `main`.

- Cloudflare Pages: directorio raíz `web`, orden de compilación `npm run build`, salida `dist`, variable `NODE_VERSION=22`.
- En local: `npm install && npm run dev`.
- La clave de Supabase de `src/datos/supabase.ts` es la pública: los permisos los ponen las políticas RLS (solo el propietario).
