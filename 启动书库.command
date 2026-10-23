#!/bin/zsh
set -e
cd "${0:A:h}"
echo "书屿正在启动，请在浏览器打开 http://localhost:4173"
echo "关闭此终端窗口或按 Ctrl+C 即可停止。"
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
