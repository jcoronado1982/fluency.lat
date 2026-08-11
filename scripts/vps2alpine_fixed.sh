#!/bin/bash
# VPS2Alpine FIXED for ARM64 - Antigravity Edition
set -e

# Configuration
VERSION="v3.19"
MIRROR="http://dl-cdn.alpinelinux.org/alpine"
ARCH=$(uname -m)

echo "--- Installing dependencies ---"
apt-get update && apt-get install -y kexec-tools wget tar cpio gzip

echo "--- Downloading Alpine assets ---"
wget ${MIRROR}/${VERSION}/releases/${ARCH}/netboot/vmlinuz-virt
wget ${MIRROR}/${VERSION}/releases/${ARCH}/netboot/initramfs-virt

echo "--- Injecting SSH keys into initramfs ---"
mkdir -p /tmp/overlay/root/.ssh
if [ -f /home/azureuser/.ssh/authorized_keys ]; then
    cp /home/azureuser/.ssh/authorized_keys /tmp/overlay/root/.ssh/authorized_keys
elif [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /tmp/overlay/root/.ssh/authorized_keys
fi
chmod 700 /tmp/overlay/root/.ssh
chmod 600 /tmp/overlay/root/.ssh/authorized_keys

cd /tmp/overlay
find . | cpio -H newc -o | gzip > /tmp/ssh_overlay.cpio.gz
cd -

cat initramfs-virt /tmp/ssh_overlay.cpio.gz > initramfs-custom

echo "--- Loading kernel via kexec ---"
# We use --append to ensure it knows where to find the network/console
kexec -l vmlinuz-virt --initrd=initramfs-custom --append="console=ttyS0,115200 ip=dhcp"

echo "--- SYSTEM WILL REBOOT INTO ALPINE RAM ENVIRONMENT IN 3 SECONDS ---"
sleep 3
kexec -e
