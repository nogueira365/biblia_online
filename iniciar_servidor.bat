@echo off
title Servidor Biblia Live
echo ===================================================
echo Iniciando o servidor local para o Biblia Live...
echo ===================================================
echo.
echo Por favor, mantenha esta janela aberta enquanto estiver usando o site.
echo.
echo Abra o seu navegador e acesse: http://localhost:8000
echo.
python -m http.server 8000
pause
