# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma

La documentación (este archivo, el README) va en español. El código se escribe siempre en inglés: nombres de archivos, variables, funciones, comentarios, títulos de las pruebas (`test`, `describe`), mensajes de error o de `skip` y datos de prueba.

## Qué es este proyecto

Suite de pruebas de API con Playwright + TypeScript para Bitácora360. No usa navegador ni necesita la app levantada: hace peticiones HTTP directas a Supabase.

La app (`../Bitacora360WebProyect`, Next.js) no tiene backend propio; el navegador consulta Supabase con la anon key y RLS limita cada fila a su dueño. Lo que esta suite prueba es el contrato que definen las migraciones de `../Bitacora360WebProyect/supabase/migrations/`: los `grant`, las políticas RLS y las restricciones (`check`, llaves foráneas, índices únicos). Al escribir o revisar una spec, la migración es la fuente de verdad de lo que la API debe aceptar o rechazar, y `features/<módulo>/api.ts` muestra qué peticiones hace la app en realidad.

La suite E2E vive aparte, en `../Bitacora360-Automation-testing`, y prueba la app por el navegador. Los tres proyectos son independientes.

## Comandos

```bash
npm install               # no hace falta instalar navegadores

npm test                  # toda la suite
npm run test:auth         # auth y acceso sin sesión
npm run test:habits       # tablas del módulo de hábitos (corre setup antes)
npm run test:ui           # modo UI de Playwright
npm run report            # abre el reporte HTML de la última corrida
npm run typecheck         # tsc --noEmit; es la única verificación estática, no hay linter

npx playwright test tests/habits/habits.spec.ts     # un archivo
npx playwright test -g "row level security"         # pruebas por título
```

## Entorno

`playwright.config.ts` carga `.env` con `process.loadEnvFile` (por eso se requiere Node >= 20.12).

- `SUPABASE_URL` y `SUPABASE_ANON_KEY`: el proyecto de Supabase bajo prueba, los mismos valores que usa la app en su `.env.local`. Sin ellas no corre nada.
- `API_USER_A_*` y `API_USER_B_*`: dos usuarios dedicados a esta suite y ya confirmados. Son dos porque las pruebas de RLS necesitan un dueño y un ajeno. No son el usuario de la suite E2E, para que ambas suites corran a la vez sin tocar los mismos datos.

Sin los usuarios, `setup` lanza un error (y `habits` no corre), mientras que `auth` pasa igual: sus pruebas con credenciales se saltan solas.

## Arquitectura

Tres proyectos de Playwright en `playwright.config.ts`:

- `setup` (`tests/users.setup.ts`) inicia sesión una vez con cada usuario y guarda id y access token en `.auth/users.json` (`SESSION_FILE` en `support/env.ts`). Así una corrida hace dos inicios de sesión en total, sin importar cuántos workers haya.
- `auth` (`tests/auth/`) no depende de `setup`: prueba el endpoint de inicio de sesión y que la Data API no abre nada sin sesión.
- `habits` (`tests/habits/`) depende de `setup`. Una spec por tabla.

Cada carpeta de `tests/` distinta de `auth` corresponde a un módulo de `features/` de la app y tiene su propio proyecto. Un módulo nuevo es una carpeta, un proyecto con `dependencies: ["setup"]`, un script `test:<módulo>` y sus tablas agregadas a la lista de `tests/auth/visitor-access.spec.ts`.

`support/supabase.ts` concentra el trato con Supabase: `signIn`, `dataApiContext` (contexto de peticiones con `baseURL` en `/rest/v1/`, por eso las specs nombran solo la tabla: `get("habits")`), `RETURN_ROWS` y `expectError`.

`support/fixtures.ts` extiende `test` con:

- `userA`, `userB` (por worker): `{ id, request }`, donde `request` es un contexto de la Data API que ya envía el token de ese usuario.
- `visitor` (por worker): contexto con la anon key y sin token.
- `habitName`: nombre único por prueba. Al terminar, borra de ambos usuarios todo hábito cuyo nombre empiece con él.
- `habit`: un hábito de `userA` llamado `habitName`, creado antes de la prueba.
- `exerciseName` y `exercise`: lo mismo para `exercises`. La limpieza borra primero las series que apuntan a esos ejercicios, porque `workout_sets.exercise_id` es `on delete restrict`.
- `workoutTitle`: título único por prueba. Al terminar, borra de ambos usuarios todo entrenamiento cuyo título empiece con él.
- `workout`: un entrenamiento de `userA` titulado `workoutTitle`. Se borra por id, así que la prueba puede cambiarle o quitarle el título.

Los fixtures crean y limpian con `insertRow` y `deleteRows`, que hacen fallar la prueba con la respuesta de Supabase si la petición es rechazada.

## Convenciones

- Las specs importan `test` y `expect` de `support/fixtures`.
- Los filtros van en `params` (`{ id: "eq.<uuid>" }`), no pegados a la URL.
- Un rechazo se verifica con `expectError(response, status, code)`: status HTTP más el código del error. En la Data API el código es el de Postgres (`23514` check, `23502` columna obligatoria sin valor, `22003` número fuera del rango de la columna, `23505` duplicado, `23503` llave foránea, `42501` permiso o RLS); en Auth viene en `error_code` (`invalid_credentials`).
- `42501` responde 403 con sesión y 401 sin ella.
- RLS oculta las filas ajenas en lugar de responder con error: un `GET` llega vacío, y un `PATCH` o `DELETE` responde bien sin tocar nada. Esas pruebas verifican después, con el dueño, que la fila sigue igual. Solo el `with check` (insertar o reasignar una fila a otro usuario) responde 403.
- Para leer la fila que devuelve una escritura se manda `RETURN_ROWS`; sin ese header la respuesta llega vacía.
- Las pruebas corren en paralelo con los mismos dos usuarios y no dependen de los datos que ya existan. Todo hábito que crea una prueba se llama `habitName` o empieza con él (`${habitName} renamed`), que es lo que permite la limpieza; lo mismo con `exerciseName` para los ejercicios y `workoutTitle` para los entrenamientos. Las filas hijas (`habit_completions`, `workout_sets`) se van solas por el `on delete cascade` de su padre.
- Una fila que la limpieza por prefijo no alcanza (un entrenamiento sin título) se crea con un fixture que la borra por id, como `workout`. Una tabla nueva sin columna de nombre sigue ese mismo patrón.
- Cuando la política RLS comprueba una tabla padre, se evalúa antes que la llave foránea: apuntar a un padre que no existe o que es de otro usuario responde `42501`, no `23503`.
