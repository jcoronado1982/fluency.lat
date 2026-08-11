#!/bin/bash
set -e

echo "1. Installing dependencies..."
sudo apt-get update
sudo apt-get install -y qemu-utils parted curl kexec-tools

echo "2. Downloading alpine-make-vm-image..."
curl -sLO https://raw.githubusercontent.com/alpinelinux/alpine-make-vm-image/master/alpine-make-vm-image
chmod +x alpine-make-vm-image

echo "3. Building Alpine raw image (ARM64)..."
sudo ./alpine-make-vm-image \
    --image-format raw \
    --image-size 2G \
    --packages "openssh curl ca-certificates bash tailscale" \
    --script-chroot \
    alpine.raw -- << 'EOF'
#!/bin/sh
# This script runs inside the Alpine image during build
rc-update add sshd default
rc-update add networking boot
rc-update add tailscale default
# Enable root login with keys
sed -i 's/^#PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
# Add Azure public IP configuration (DHCP on eth0 is usually default, but we enforce it)
cat << 'NET' > /etc/network/interfaces
auto lo
iface lo inet loopback
auto eth0
iface eth0 inet dhcp
NET
EOF

echo "4. Injecting SSH keys into the raw image..."
# Find a free loop device
LOOP_DEV=$(sudo losetup -f)
# Setup loop device with partitions
sudo losetup -P $LOOP_DEV alpine.raw
# Mount the root partition (usually partition 3 in alpine-make-vm-image, or 2)
# alpine-make-vm-image creates: 1: bios_grub (or fat32 for efi), 2: boot, 3: root
# Let's just mount the rootfs. Usually it's partition 2 for EFI.
sudo mount ${LOOP_DEV}p2 /mnt || sudo mount ${LOOP_DEV}p3 /mnt
sudo mkdir -p /mnt/root/.ssh
sudo cp /home/azureuser/.ssh/authorized_keys /mnt/root/.ssh/
sudo chmod 700 /mnt/root/.ssh
sudo chmod 600 /mnt/root/.ssh/authorized_keys
sudo umount /mnt
sudo losetup -d $LOOP_DEV

echo "5. Preparing takeover.sh..."
curl -sLO https://raw.githubusercontent.com/marcan/takeover.sh/master/takeover.sh
chmod +x takeover.sh

echo "READY FOR TAKEOVER. Run: sudo ./takeover.sh"
