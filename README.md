# Padrón · Comité de Base

Sistema para movimientos y comités de base: un administrador y varios coordinadores que registran votantes.

- **Página pública**: consulta por cédula (muestra nombre, provincia, sector, circunscripción y coordinador) y acceso al sistema.
- **Coordinador**: registra votantes, ve y descarga **solo su lista** en Excel, filtra por provincia, sector y circunscripción, edita su perfil y contraseña.
- **Administrador**: ve todo el padrón con el coordinador que registró a cada votante, filtra también por coordinador, gestiona coordinadores (crear, editar, desactivar, cambiar contraseña, eliminar), corrige el catálogo de sectores y configura nombre, lema y logo (se imprimen en el Excel).
- **Cédula única** en todo el sistema (restricción en la base de datos).
- Al elegir el sector, la **circunscripción se asigna automáticamente**.

## Tecnología

Next.js 15 + Tailwind CSS 4 y PostgreSQL. Toda la lógica de permisos vive en funciones `SECURITY DEFINER`
(`database/instalar.sql`); la aplicación solo llama a esas funciones, con el token de sesión guardado en una cookie httpOnly.

La app funciona de dos formas:
- **Servidor propio + PostgreSQL local:** variable `DATABASE_URL`. Ver **[INSTALACION.md](INSTALACION.md)**.
- **Vercel + Supabase:** variables `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.

## Catálogo de sectores

`data/sectores.json` se genera con `data/build_sectores.py` (municipios: 158 + La Victoria y La Caleta;
circunscripciones por municipio según la Resolución JCE 04-2019; barrios del Distrito Nacional y sectores/barrios de
Santo Domingo Este según sus ayuntamientos). Los barrios de la ciudad de Santiago tienen una asignación aproximada:
el administrador puede corregirlos desde **Panel → Sectores**.
