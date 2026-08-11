#!/bin/sh
# Alias retrocompatible: despliega solo Caddy.
exec "$(dirname "$0")/deploy-caddy.sh" "$@"
