#! /bin/bash
SHELL_FOLDER=$(cd "$(dirname "$0")";pwd)
cd "$SHELL_FOLDER"

set -x -e -u -o pipefail

# check notion developer page about notion key and database_id
export NOTION_KEY="secret_uzvPILsmDbjxGpBK2PjmEqdMX2aZDAeqjMx5h7F3jMi"
export DATABASE_ID="eeb0bef5329e4c11982ca630d2d684a8"

node habit_tracker.js > out.txt 2>&1
