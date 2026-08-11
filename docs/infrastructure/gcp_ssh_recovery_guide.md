# 🛠️ Guía de Recuperación SSH: Alpine en Google Cloud

Esta guía documenta el procedimiento de "Break-Glass" para recuperar el acceso SSH a una instancia de Alpine Linux en GCP cuando los métodos estándar (Password, Keys, Startup Scripts) fallan.

## 🚨 El Problema Común
En imágenes "puras" de Alpine importadas vía VHD:
1.  **Falta del Guest Agent**: Alpine no suele incluir el agente de Google, por lo que los *Startup Scripts* y la gestión de llaves de `gcloud ssh` no funcionan.
2.  **Configuración Restrictiva**: El archivo `/etc/ssh/sshd_config` puede tener directivas como `AllowUsers` que bloquean a `root`, o `PermitRootLogin prohibit-password`.

## 🛠️ Procedimiento de Recuperación (Mount & Fix)

Si no puedes entrar por SSH ni por Consola Serie:

### 1. Preparación
*   **Detener la instancia**: `gcloud compute instances stop [VM_NAME] --zone [ZONE]`
*   **Identificar el disco**: El disco suele llamarse igual que la VM.

### 2. Método de Montaje en VM de Reparación
Si la zona original tiene recursos:
1.  Crea una VM temporal (Debian/Ubuntu) en la misma zona.
2.  Desconecta el disco de la VM Alpine y conéctalo a la VM de reparación.
3.  Monta la partición (usualmente la última, ej: `/dev/sdb3`).

Si la zona está **saturada** (ej: `ZONE_RESOURCE_POOL_EXHAUSTED`):
1.  **Snapshot**: Crea un snapshot del disco:
    `gcloud compute disks snapshot [DISK_NAME] --snapshot-names repair-snap`
2.  **Disco en zona B**: Crea un disco desde el snapshot en una zona con espacio (ej: `us-central1-a`):
    `gcloud compute disks create repair-disk --source-snapshot repair-snap --zone us-central1-a`
3.  **VM de Reparación**: Crea la VM en esa zona B y adjunta el disco.

### 3. Cirugía de Archivos
Una vez dentro de la VM de reparación:
```bash
# Crear punto de montaje
sudo mkdir -p /mnt/repair
# Montar la partición de sistema (en Alpine suele ser la 3)
sudo mount /dev/sdb3 /mnt/repair

# 1. Quitar restricciones de usuario
sudo sed -i '/AllowUsers/d' /mnt/repair/etc/ssh/sshd_config

# 2. Habilitar login de root y password
sudo bash -c "echo 'PermitRootLogin yes' >> /mnt/repair/etc/ssh/sshd_config"
sudo bash -c "echo 'PasswordAuthentication yes' >> /mnt/repair/etc/ssh/sshd_config"

# 3. (Opcional) Resetear password
sudo chroot /mnt/repair /bin/sh -c "echo 'root:Privado01*' | chpasswd"

# Desmontar
sudo umount /mnt/repair
```

### 4. Restauración
1.  Elimina la VM de reparación.
2.  Toma un snapshot del disco ya reparado.
3.  Crea un nuevo disco en la zona original desde ese snapshot "limpio".
4.  Conecta el nuevo disco a la VM original como **boot disk**.
5.  Inicia la VM.

## ✅ Verificación
Prueba el acceso forzando el uso de contraseña para evitar bloqueos por llaves locales:
```bash
ssh -o IdentitiesOnly=yes root@[NUEVA_IP]
```

## 📝 Notas de Mantenimiento
*   **IP Dinámica**: Al reiniciar/recrear la instancia, la IP pública puede cambiar. Actualiza siempre el `server_inventory.md`.
*   **Agente de Google**: Se recomienda instalar `google-guest-agent` en Alpine si es posible para evitar este proceso en el futuro.
