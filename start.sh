#! /bin/bash
SHELL_FOLDER=$(cd "$(dirname "$0")";pwd)
cd "$SHELL_FOLDER"

set -x -e -u -o pipefail

# check notion developer page about notion key and database_id
export NOTION_KEY="YOU_KEY_HERE"
export DATABASE_ID="YOU_DATABASE_ID_HERE"

node index.js

