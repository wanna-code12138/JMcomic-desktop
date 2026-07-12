@echo off
cd /d "D:\soft\Opencode\JMComic"
set PATH=C:\Program Files\nodejs;%PATH%
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npx electron-vite dev
pause
