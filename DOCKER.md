# Запуск Demo Slides на сервере

## Быстрый запуск

1. Установите Docker Engine и Docker Compose.
2. Передайте на сервер всю папку проекта и откройте её в терминале.
3. Скопируйте `.env.docker.example` в `.env`.
4. Если нужен экспорт в Google Slides, укажите в `.env` значение `VITE_GOOGLE_CLIENT_ID`. Если он не нужен, оставьте значение пустым.
5. Запустите приложение:

   ```sh
   docker compose up -d --build
   ```

6. Откройте `http://IP_СЕРВЕРА:3000`.

Порт можно изменить в `.env`, например: `DEMO_SLIDES_PORT=8080`.

## Google Slides

Для авторизации Google домен приложения должен быть добавлен в Google Cloud Console:

1. Откройте Google Auth Platform → Clients.
2. Выберите OAuth-клиент приложения.
3. В `Authorized JavaScript origins` добавьте точный публичный адрес, например `https://slides.example.com`.

Redirect URI для используемой token-модели не требуется. `VITE_GOOGLE_CLIENT_ID` встраивается во время сборки, поэтому после его изменения пересоберите контейнер командой `docker compose up -d --build`.

## Управление

Посмотреть состояние и журнал:

```sh
docker compose ps
docker compose logs -f
```

Остановить приложение:

```sh
docker compose down
```

Обновить после замены файлов проекта:

```sh
docker compose up -d --build
```

Для публичного сервера рекомендуется поставить перед контейнером reverse proxy (например, Caddy или Nginx) и включить HTTPS. Сам контейнер слушает порт `3000` внутри сети Docker.
