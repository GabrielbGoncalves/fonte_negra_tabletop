@echo off
rem Sobe o ambiente local (emuladores + contas de teste). Pode abrir com dois cliques.
rem Repassa os argumentos: iniciar.cmd --limpo  |  iniciar.cmd --abrir
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js nao encontrado. Instale o Node 18 ou mais novo. & pause & exit /b 1)
node emulador\iniciar.js %*
pause
