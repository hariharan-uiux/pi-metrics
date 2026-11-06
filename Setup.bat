@echo off
title Pi Metrics Setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Setup-PiMetrics.ps1"
if %errorlevel% neq 0 pause
