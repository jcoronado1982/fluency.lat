# Guía de Instalación: Alpine Linux Nativo en Azure ARM64

Esta guía documenta el proceso para desplegar una instancia de Alpine Linux pura (sin capas de Ubuntu/Docker) en máquinas virtuales ARM64 de Azure (Standard_B2pts_v2), optimizando el uso de RAM a menos de 50MB.

## 1. Preparación de la Imagen Local (VHD)

Azure requiere un formato de disco muy específico. No se puede subir una imagen cruda sin más.

1.  **Obtener la imagen**: Descargar `alpine-cloud-image` para aarch64.
2.  **Configuración del Sistema**:
    *   Montar la imagen localmente usando `losetup`.
    *   Inyectar llaves SSH en `/root/.ssh/authorized_keys`.
    *   Configurar la red en `/etc/network/interfaces`.
    *   **Crítico**: Habilitar servicios en OpenRC:
        ```bash
        ln -s /etc/init.d/sshd /etc/runlevels/default/sshd
        ln -s /etc/init.d/networking /etc/runlevels/default/networking
        ```
3.  **Conversión a VHD Azure**:
    *   Redimensionar el archivo a un múltiplo exacto de 1 MiB (ej. 2GiB).
    *   Convertir usando `qemu-img` con el parámetro `force_size`:
        ```bash
        qemu-img convert -f raw -O vpc -o subformat=fixed,force_size source.raw destination.vhd
        ```
    *   Esto asegura que el archivo tenga el footer "conectix" al final y el tamaño que Azure exige.

## 2. Preparación en Azure

1.  **Registro de Proveedores**: Asegurar que `Microsoft.Storage` esté registrado en la suscripción.
2.  **Subida**: Subir el VHD a un Blob Storage (Page Blob).
3.  **Creación del Disco (Paso Vital)**:
    Crear un Managed Disk desde el blob especificando la arquitectura ARM. **Si no se especifica, Azure asumirá x64 y la VM no arrancará**.
    ```bash
    az disk create \
      --name alpine-disk-arm \
      --source "https://<storage>.blob.core.windows.net/images/alpine.vhd" \
      --architecture Arm64 \
      --hyper-v-generation V2 \
      --os-type Linux
    ```

## 3. Despliegue de la VM

Debido a bugs en la Azure CLI al manejar imágenes personalizadas ARM, se recomienda el uso de la API REST directa o una plantilla ARM/Bicep para evitar el crash del comando `az vm create`.

**Petición REST (CURL):**
```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "location": "southcentralus",
    "properties": {
      "hardwareProfile": { "vmSize": "Standard_B2pts_v2" },
      "storageProfile": {
        "osDisk": {
          "createOption": "Attach",
          "managedDisk": { "id": "/path/to/alpine-disk-arm" }
        }
      },
      "networkProfile": {
        "networkInterfaces": [{ "id": "/path/to/alpine-nic" }]
      }
    }
  }' \
  "https://management.azure.com/subscriptions/<sub-id>/resourceGroups/<rg>/providers/Microsoft.Compute/virtualMachines/<vm-name>?api-version=2021-11-01"
```

## 4. Notas de Red y Seguridad

*   **Puertos**: Asegurar que el Network Security Group (NSG) permita el puerto 22.
*   **IPs**: Asociar una Public IP Standard al NIC antes de lanzar la VM.

## 5. Resultados
*   **RAM**: ~42MB - 70MB en reposo.
*   **Arquitectura**: ARM64 nativa.
*   **Rendimiento**: Acceso directo al hardware sin virtualización anidada.
