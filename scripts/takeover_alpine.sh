#!/bin/sh
set -e

# Alpine 3.19 ARM64 Takeover Script
# WARNING: This script will WIPE the disk and install Alpine Linux.

MIRROR="http://dl-cdn.alpinelinux.org/alpine/v3.19/main"
ARCH="aarch64"
ROOTFS_URL="http://dl-cdn.alpinelinux.org/alpine/v3.19/releases/aarch64/alpine-minirootfs-3.19.1-aarch64.tar.gz"

# 1. Install dependencies on Ubuntu
apt-get update && apt-get install -y kexec-tools wget tar

# 2. Download Alpine files
wget http://dl-cdn.alpinelinux.org/alpine/v3.19/releases/aarch64/netboot/vmlinuz-virt
wget http://dl-cdn.alpinelinux.org/alpine/v3.19/releases/aarch64/netboot/initramfs-virt

# 3. Create an SSH overlay cpio archive
mkdir -p /tmp/overlay/root/.ssh
cp /home/azureuser/.ssh/authorized_keys /tmp/overlay/root/.ssh/authorized_keys
chmod 700 /tmp/overlay/root/.ssh
chmod 600 /tmp/overlay/root/.ssh/authorized_keys

cd /tmp/overlay
find . | cpio -H newc -o | gzip > /home/azureuser/ssh_overlay.cpio.gz

# 4. Concatenate original initramfs with our overlay
cat /home/azureuser/initramfs-virt /home/azureuser/ssh_overlay.cpio.gz > /home/azureuser/initramfs-custom

# 5. Kexec into Alpine
sudo kexec -l /home/azureuser/vmlinuz-virt --initrd=/home/azureuser/initramfs-custom --append="console=ttyS0,115200 ip=dhcp"
sudo kexec -e
