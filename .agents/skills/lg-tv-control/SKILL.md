---
name: lg-tv-control
description: Instrucciones para que Gemini y Claude controlen el TV LG WebOS del usuario (192.168.78.242) sin librerías especiales — solo SSH y herramientas nativas del sistema.
---

# Control del TV LG WebOS — Sin librerías, solo SSH

## Datos del TV
- **IP**: `192.168.78.242`
- **Red**: Local de La Bestia (`192.168.78.0/24`)
- **SSH Developer Mode**: puerto `9922`, usuario `prisoner`
- **Llave SSH**: `~/.ssh/lg_tv_key` (una vez generada con LG Dev Mode)
- **WebOS API**: puerto `3000` (WebSocket, accesible via `curl` desde La Bestia)

## Cómo conectarte (como Gemini corriendo en La Bestia)

Usa tu herramienta `run_command` o cualquier bash directamente:

```bash
ssh -p 9922 -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa \
    -i ~/.ssh/lg_tv_key prisoner@192.168.78.242 "<comando>"
```

## Cómo conectarte (como Claude en El Server)

Usa `mcp__local_pc__run_local_command` para que La Bestia ejecute el SSH:

```
run_local_command: ssh -p 9922 -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa -i ~/.ssh/lg_tv_key prisoner@192.168.78.242 "<comando>"
```

## Comandos útiles dentro del TV (WebOS shell)

```bash
# Listar apps instaladas
ls /media/developer/apps/usr/palm/applications/

# Ver procesos activos
ps aux | grep -i luna

# Enviar una notificación/toast a la pantalla
luna-send -n 1 palm://com.palm.applicationManager/launch \
  '{"id":"com.webos.app.systemui","params":{"message":"Hola desde Claude!"}}'

# Ver volumen actual
luna-send -n 1 palm://com.webos.audio/getVolume '{}'

# Subir volumen
luna-send -n 1 palm://com.webos.audio/setVolume '{"volume":20}'

# Apagar TV
luna-send -n 1 luna://com.palm.sleep/shutdown/machineOff '{}'

# Abrir app (ejemplo Netflix)
luna-send -n 1 palm://com.palm.applicationManager/launch '{"id":"netflix"}'

# Simular tecla remota (OK, UP, DOWN, BACK, HOME, etc.)
# Se hace via ares-shell o luna-send a com.webos.service.ime
```

## Estado del emparejamiento SSH

> Para que el SSH funcione, el usuario debe hacer lo siguiente UNA SOLA VEZ:
> 1. Activar **Modo Desarrollador** en el TV: App Store → "Developer Mode" → Login con cuenta LG Developers
> 2. En la app del TV activar "Key Server" ON
> 3. Desde La Bestia ejecutar:
>    ```bash
>    # Esto genera y sube la llave pública al TV (pide la passphrase temporal de la app)
>    ssh-keygen -t rsa -b 2048 -f ~/.ssh/lg_tv_key -N ""
>    ssh-copy-id -p 9922 -i ~/.ssh/lg_tv_key.pub prisoner@192.168.78.242
>    ```
> 4. Una vez hecho, guarda la llave en `~/.ssh/lg_tv_key` — todos los comandos de arriba funcionarán sin contraseña.

## Notas importantes

- El TV LG **NO necesita Docker, librerías Python ni websocket clients** — tiene un shell Unix completo con `luna-send`.
- Si el usuario dice "dile a la tele", "pon en la tele", "sube el volumen", etc., usa los comandos de arriba.
- Si la llave SSH no existe aún, indícale al usuario los pasos de emparejamiento de arriba.
