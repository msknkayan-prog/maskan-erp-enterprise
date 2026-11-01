@echo off
cd /d "%~dp0"
py -3 PREPARE_V38_TRANSFER.py
if errorlevel 1 python PREPARE_V38_TRANSFER.py
pause
