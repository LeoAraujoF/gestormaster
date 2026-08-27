#!/bin/sh
set -eu

exec /usr/local/bin/uvx --from 'mcp-portainer~=2.44.0' mcp-portainer
