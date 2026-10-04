# Bitácora360 — API testing

Pruebas de API de [Bitácora360](../Bitacora360WebProyect) con Playwright +
TypeScript. Es un proyecto independiente: vive junto al proyecto web y a la
suite E2E (`../Bitacora360-Automation-testing`), y no usa navegador.

La app no tiene backend propio: el navegador habla directo con Supabase. Por
eso aquí la "API" es la de Supabase, y lo que se prueba es el contrato que
definen las migraciones de `../Bitacora360WebProyect/supabase/migrations/`:

- **Data API** (`/rest/v1/<tabla>`): permisos, políticas RLS y restricciones de
  cada tabla.
- **Auth** (`/auth/v1/...`): inicio de sesión por contraseña.

## Preparación

```bash
npm install
```

No hace falta `npx playwright install`: las pruebas solo hacen peticiones HTTP.

Copia `.env.example` como `.env` y llena:

1. `SUPABASE_URL` y `SUPABASE_ANON_KEY`: los mismos valores que
   `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el
   `.env.local` de la app.
2. `API_USER_A_*` y `API_USER_B_*`: **dos usuarios dedicados a estas pruebas**.
   Créalos en el panel de Supabase (Authentication → Users → Add user, con
   "Auto Confirm User") o en la app (`/register`), confirmando el email.

No uses tu cuenta personal ni el usuario de la suite E2E: las pruebas crean y
borran filas con estos usuarios, y con usuarios propios las dos suites pueden
correr al mismo tiempo sin estorbarse.

## Ejecución

No hace falta levantar la app: las pruebas van directo a Supabase.

| Comando               | Qué hace                                                 |
| --------------------- | -------------------------------------------------------- |
| `npm test`            | Corre toda la suite                                      |
| `npm run test:auth`   | Auth y acceso sin sesión (no requiere los dos usuarios)  |
| `npm run test:habits` | Tablas del módulo de hábitos (inicia sesión antes)       |
| `npm run test:ui`     | Modo UI: correr, depurar y ver cada petición             |
| `npm run report`      | Abre el reporte HTML de la última corrida                |
| `npm run typecheck`   | Revisa los tipos de TypeScript                           |

Un archivo o una prueba en particular:

```bash
npx playwright test tests/habits/habits.spec.ts
npx playwright test -g "row level security"
```

## Estructura

```
support/
  env.ts          Variables de .env (proyecto de Supabase y usuarios de prueba)
  supabase.ts     Peticiones a Supabase: inicio de sesión, contexto de la Data API, expectError
  fixtures.ts     userA, userB, visitor, habitName y habit
tests/
  users.setup.ts  Inicia sesión con los dos usuarios y guarda sus tokens en .auth/
  auth/           Sin sesión guardada: inicio de sesión y acceso sin sesión
  habits/         Con sesión: una spec por tabla del módulo de hábitos
```

Cada carpeta de `tests/` (salvo `auth`) corresponde a un módulo de `features/`
en la app, y dentro hay una spec por tabla.

### Proyectos de Playwright

- **setup** — inicia sesión una vez con cada usuario y guarda los tokens en
  `.auth/users.json`.
- **auth** — no depende de `setup`; las pruebas que necesitan credenciales se
  saltan solas si faltan en `.env`.
- **habits** — depende de `setup` y usa los tokens guardados.

## Convenciones

- El código va en inglés: nombres, comentarios, títulos de las pruebas, mensajes
  y datos de prueba.
- Las specs importan `test` y `expect` de `support/fixtures`, no de
  `@playwright/test`.
- Una prueba que espera un rechazo verifica el status HTTP y el código del
  error con `expectError(response, status, code)`. Los más comunes:

  | Código  | Status    | Qué significa                                             |
  | ------- | --------- | --------------------------------------------------------- |
  | `23514` | 400       | No cumple un `check` (largo del nombre, días válidos)     |
  | `23505` | 409       | Fila duplicada (clave primaria o índice único)            |
  | `23503` | 409       | Rompe una llave foránea                                   |
  | `42501` | 403 / 401 | Sin permiso o rechazado por RLS (401 si no hay sesión)    |

- RLS no responde con error al leer, modificar o borrar filas ajenas: las
  oculta. La lectura llega vacía y la escritura no cambia nada, así que esas
  pruebas verifican después, con el dueño, que la fila sigue intacta.
- Las pruebas no dependen de los datos que ya tengan los usuarios: cada una crea
  lo que necesita con un nombre único (`habitName`) y el fixture lo borra al
  terminar.

## Agregar un módulo nuevo

Cuando la app agregue una migración (finanzas, watchlist):

1. Crea `tests/<módulo>/` con una spec por tabla.
2. Agrega el proyecto en `playwright.config.ts`, con `dependencies: ["setup"]`,
   y su script `test:<módulo>` en `package.json`.
3. Agrega las tablas nuevas a la lista de `tests/auth/visitor-access.spec.ts`.
