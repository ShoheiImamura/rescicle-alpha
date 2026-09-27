#!/usr/bin/env bash
# design/ の PlantUML 図をすべて再生成し、design/generated/<dir>/ に置く。
# 原本と生成物は同名（@startuml 名 = ファイル名）。plantuml.jar は各自で取得し、
# PLANTUML 環境変数でパスを指定する（既定: ./plantuml.jar）。
# 横に広い図（problem-causal-model など）が PNG で切れないよう、画像の上限を 8192px に上げる。
set -euo pipefail
cd "$(dirname "$0")"
PLANTUML="${PLANTUML:-plantuml.jar}"
for d in concept rdra erd; do
  [ -n "$(ls "$d"/*.puml 2>/dev/null)" ] || continue
  # -t は最後の 1 つしか効かないので、形式ごとに実行する
  for t in svg png; do
    java -DPLANTUML_LIMIT_SIZE=8192 -jar "$PLANTUML" "-t$t" -o "../generated/$d" "$d"/*.puml
  done
done
