# Pipeline de Calidad de Código con IA

Detección automática de deuda técnica y vulnerabilidades de seguridad integrada directamente en el flujo de GitHub.

> Powered by **Claude Opus 4.6** · **GitHub Actions** · **Trello**

---

## El Problema

Los code reviews manuales fallan bajo presión de tiempo. Las credenciales expuestas, inyecciones SQL y algoritmos inseguros llegan a producción sin ser detectados. La deuda técnica rara vez se registra formalmente y cuando se detecta, semanas o meses después del merge, el costo de corregirla es mucho mayor.

---

## La Solución

Dos automatizaciones que cubren todo el ciclo de vida de un cambio:

| Evento | Acción |
|--------|--------|
| **Pull Request abierto o actualizado** | Claude revisa el diff y publica un comentario con el análisis |
| **Merge a main con problemas sin resolver** | Se crea automáticamente un ticket en Trello con la deuda técnica |

---

## El Flujo Completo

```
Developer          GitHub Actions        Claude Opus 4.6       Resultado
──────────         ──────────────        ───────────────       ─────────
Abre PR       →   Extrae el diff    →   Analiza con 6     →   Comentario en el PR
                                        criterios de           con hallazgos
Hace merge    →   Extrae diff del   →   seguridad y       →   Ticket en Trello
a main            commit                calidad               con deuda técnica
```

---

## ¿Qué Detecta?

| Severidad | Categoría |
|-----------|-----------|
| 🔴 Crítico | Credenciales hardcodeadas — API keys, passwords, tokens, SSH keys en el código fuente |
| 🔴 Crítico | Vulnerabilidades OWASP — SQL Injection, Path Traversal, Command Injection, XSS |
| 🟠 Alto    | Algoritmos inseguros — MD5/SHA1 para contraseñas, JWT con clave débil |
| 🟠 Alto    | Exposición de datos sensibles — contraseñas o secretos en respuestas HTTP |
| 🟠 Alto    | Problemas de lógica — backdoors, tokens predecibles, comparaciones inseguras |
| 🟡 Medio   | Buenas prácticas — falta de validación, autenticación ausente, logs con datos sensibles |

---

## Configuración

### 1. Secrets de GitHub

Ve a **Settings → Secrets and variables → Actions** y agrega:

| Secret | Descripción | Cómo obtenerlo |
|--------|-------------|----------------|
| `ANTHROPIC_API_KEY` | API key de Anthropic | [console.anthropic.com](https://console.anthropic.com) |
| `TRELLO_API_KEY` | API key de Trello | [trello.com/power-ups/admin](https://trello.com/power-ups/admin) |
| `TRELLO_TOKEN` | Token de acceso a Trello | `https://trello.com/1/authorize?expiration=never&scope=read,write&response_type=token&key=TU_API_KEY` |
| `TRELLO_LIST_ID` | ID de la lista destino | `https://api.trello.com/1/boards/BOARD_ID/lists?key=...&token=...` |

### 2. Workflows

Los workflows se activan automáticamente. No requiere configuración adicional.

```
.github/
├── workflows/
│   ├── code-review.yml    ← se dispara en cada Pull Request
│   └── tech-debt.yml      ← se dispara en cada merge a main
└── scripts/
    ├── review.mjs         ← analiza el PR y publica comentario
    └── tech-debt.mjs      ← detecta deuda técnica y crea ticket en Trello
```

---

## Resultado en Trello

Cuando se detecta deuda técnica después de un merge, se crea automáticamente un card con el siguiente formato:

```
🔴 Deuda Técnica [a1b2c3d] — 4 problemas detectados
────────────────────────────────────────────────────
Commit: `a1b2c3d` — Merge PR #5: add db utility
Autor: Juan Perez

[CRITICAL] 🔒 Seguridad
Archivo: src/users/utils/db.util.ts
Problema: Credencial de BD hardcodeada en el código fuente
Sugerencia: Usar variables de entorno con process.env

[CRITICAL] 🔒 Seguridad
Archivo: src/users/utils/db.util.ts
Problema: SQL Injection en endpoint /reports/user
Sugerencia: Usar prepared statements o un ORM

[HIGH] 🔒 Seguridad
Problema: Contraseña de BD expuesta en respuesta HTTP
...
```

---

## Casos de Uso

El mismo patrón puede extenderse a otras necesidades del equipo:

| # | Caso de Uso | Disparador | Destino |
|---|-------------|-----------|---------|
| 1 | **Cobertura de Unit Tests** | Funciones nuevas sin test | Ticket en Trello |
| 2 | **Nuevos Endpoints → QA** | Endpoints creados o modificados | Backlog de QA Automation |
| 3 | **Cierre de Vulnerabilidad** | Issue de seguridad resuelto | Reporte formal para auditorías |
| 4 | **Cambios en Base de Datos** | Migraciones o cambios de schema | Ticket para el DBA |
| 5 | **Módulos Críticos Modificados** | Cambios en auth, pagos o permisos | Revisión obligatoria del Tech Lead |
| 6 | **Changelog para Producto** | Cada merge a main | Resumen en lenguaje no técnico |
| 7 | **Deuda de Documentación** | Funciones públicas sin JSDoc | Ticket con docstring sugerido |
| 8 | **Análisis de Dependencias** | Cambios en package.json | Reporte de vulnerabilidades conocidas |

---

## Optimización de Costos

El costo base es ~$0.05 USD por revisión con Claude Opus 4.6. Aplicando estas estrategias se puede reducir a ~$0.005:

| Optimización | Ahorro | Descripción |
|-------------|--------|-------------|
| **Modelo por tamaño de diff** | ~80% en diffs pequeños | Diffs <100 líneas usan Haiku (10x más barato). Solo Opus para diffs grandes o archivos críticos |
| **Prompt Caching** | ~30% del total | El system prompt es idéntico en cada llamada. Con `cache_control` se cobra al 10% en llamadas seguidas |
| **Filtrar archivos irrelevantes** | ~40% menos tokens | Excluir `*.lock`, `*.yml`, `*.md`, imágenes y `dist/` antes de enviar el diff |
| **Umbral mínimo de líneas** | Elimina llamadas innecesarias | Si el diff tiene <10 líneas se omite el análisis por completo |
| **Desactivar Thinking en diffs simples** | Variable | `adaptive thinking` agrega tokens de razonamiento. Se puede omitir para diffs triviales |

**Resultado:** 50 PRs/mes pasan de ~$2.50 a ~$0.25 USD.

---

## Stack

| Tecnología | Rol | Costo |
|------------|-----|-------|
| **GitHub Actions** | Orquesta el pipeline | Gratis (repos públicos) |
| **Claude Opus 4.6** | Motor de análisis de código | ~$0.05 / revisión |
| **Trello API** | Destino de la deuda técnica | Gratis |
| **Node.js 20** | Runtime de los scripts | Incluido en Actions |
