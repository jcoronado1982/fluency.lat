# 📦 Archivo histórico — NO leer para contexto vigente

Los documentos de esta carpeta son **históricos**: notas de sesión, post-mortems, backups y
especificaciones ya ejecutadas. Describen el estado del sistema **en su fecha**, no el actual.

- El estado vigente del sistema está en los documentos canónicos enlazados desde
  [`CLAUDE.md`](../../CLAUDE.md) (raíz del repo).
- Si un dato de aquí contradice un canónico, **manda el canónico**.
- Uso legítimo de esta carpeta: entender por qué se tomó una decisión pasada, reconstruir un
  incidente, o auditar la evolución del sistema.

| Archivo | Qué era | Fecha |
|---|---|---|
| `context_summary.md` | Nota de sesión: ajustes de generación de imágenes y OOM de GPU | 2026-07-06 |
| `pipeline_crosscompile_debug.md` | Sesión de debug de cross-compile ARM64 | 2026-06-06 |
| `azure-pipelines.yml.bak` | Backup obsoleto del pipeline (el vigente es `azure-pipelines.yml` en la raíz) | — |
| `llms-txt-historia.md` | Changelogs históricos que vivían en `llms.txt` (v1.5.0/2.0.0, jun 2026) | 2026-06 |
| `INCIDENT_REPORT_AUDIO_ORACLE_MODE_2026-07.md` | Post-mortem: audio mudo en modo Oracle (`ORACLE_REPOSITORY_ONLY`) | 2026-07 |
| `INCIDENT_REPORT_GEMINI_LEAK_2026.md` | Post-mortem: bloqueo de IA / migración Gemini 3.1 | 2026 |
| `reviews/` | Auditorías fechadas de infra/pipeline en vivo | 2026-07-11 |
