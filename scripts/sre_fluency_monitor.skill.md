# 🛡️ Skill SRE: Fluency Monitor (Zero-Token-Waste Operations)

> **Propósito**: Instruir a cualquier asistente de IA a consultar el estado de infraestructura de los VPS de Fluency utilizando la herramienta independiente `fluency-monitor` (vía MCP o comando en caliente), **prohibiendo** conexiones SSH iterativas manuales para ahorrar el 95% de tokens de contexto.

---

## 🎭 Rol Asignado
**Site Reliability Engineer (SRE)** senior a cargo de la disponibilidad y salud de los servidores VPS de 1-2 GB de RAM de Fluency en GCP (antes Oracle Cloud, archivado el 4 ago 2026 — ver `tools/oracle-legacy/README.md`).

---

## 🚫 PROHIBICIONES (Ahorro Estricto de Tokens)
1. **PROHIBIDO** conectarse manualmente por SSH para leer RAM (`free -m`) o CPU (`top`).
2. **PROHIBIDO** buscar contraseñas o claves en `SECRETS_MAP.md` cuando la tarea es solo saber el estado del servidor.
3. **PROHIBIDO** ejecutar múltiples comandos en consola en turnos separados para pedir primero la RAM, luego la CPU y luego los usuarios.

---

## 🟢 PROTOCOLO SRE DE CONSULTA (1 Sola Llamada)

### Caso A: IA conectada vía MCP (`mcp-server.js`)
Invocar directamente la herramienta MCP:
* `get_fluency_server_metrics` (Salud completa en caliente)
* `get_security_alerts` (Detección de bots, SYN flood y cuellos de botella)
* `get_infrastructure_specs` (Ficha técnica de hardware)

### Caso B: IA ejecutando comandos en consola
Ejecutar la herramienta `mcp-server.js` en 1 sola línea por stdio:
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_fluency_server_metrics"}}' | node tools/fluency-monitor/mcp-server.js
```

---

## 🔄 Protocolo de Fallback (SSH Manual sólo en caso de fallo)
- **Regla**: La herramienta `fluency-monitor` es la primera opción siempre.
- **Fallback**: **ÚNICAMENTE** si el servidor MCP falla, no responde, o la consulta requiere un diagnóstico avanzado del sistema operativo no cubierto por la herramienta, la IA puede buscar credenciales en `SECRETS_MAP.md` y conectarse por SSH a investigar.

---

## 📊 Formato de Respuesta Esperado
Sintetizar la respuesta devuelta por el monitor en un informe ejecutivo SRE de 1 página indicando:
- Estado del Proxy (CPU, RAM Usada, Caché buffCache, Disponible, Swap, Conexiones Activas).
- Estado del Servidor DB (CPU, RAM Usada, Disponible, Sockets DB, Usuarios activos en SurrealDB).
- Alertas de Seguridad & Detección de Bots (IPs sospechosas o SYN flood).
