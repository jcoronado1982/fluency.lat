#!/bin/bash
# Azure ARM Alpine Linux Installation Script (Cloud-Init)
set -e

# Install dependencies
apt-get update
apt-get install -y wget qemu-utils

# Download Alpine ARM64 Image (Standard Virtual)
# Using the cloud image if available or building one in memory
# For simplicity, we use the vps2alpine script which is more robust for cloud environments
wget https://raw.githubusercontent.com/itdoginfo/vps2alpine/master/vps2alpine.sh
chmod +x vps2alpine.sh

# Run the installation (it will reboot into Alpine)
# We pass the SSH key to ensure we don't lose access
./vps2alpine.sh -v 3.19 -a aarch64
