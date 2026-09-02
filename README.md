# Lego Slides

Веб-редактор презентаций с блочным холстом и сеткой. Слайды собираются из текста, метрик, изображений, мокапов устройств, таблиц, графиков и разделителей, а готовую презентацию можно экспортировать в PowerPoint или Google Slides.

## Возможности

- создание и удаление слайдов;
- миниатюры слайдов в левой панели;
- блочная сетка с настраиваемыми колонками, строками, отступами и фоном;
- перетаскивание блоков из нижнего Dock на холст;
- перемещение и изменение размера блоков с привязкой к сетке;
- дублирование выбранного блока через `Ctrl+D`;
- копирование блока во время перетаскивания с зажатой клавишей `Alt`;
- WYSIWYG-редактирование текстового блока по двойному клику;
- отдельные настройки страницы и выбранного объекта;
- мокапы iPhone, Android и MacBook с настройкой модели, цвета, масштаба и смещения;
- фоны `None`, `Solid` и `Mesh`, включая собственные изображения;
- включение и отключение отображения сетки;
- экспорт в `.pptx`;
- экспорт в Google Slides через Google OAuth;
- растровый экспорт градиентных фонов в PNG для корректного отображения в Google Slides;
- автоматическое сохранение проекта в браузере.

## Технологии

- React 19 и TypeScript;
- Vinext и Vite;
- Gravity UI и Gravity UI Icons;
- PptxGenJS для PowerPoint;
- Google Identity Services и Google Drive API для Google Slides;
- Cloudflare Workers-совместимая серверная сборка;
- Docker и Docker Compose.

## Структура проекта

```text
lego-slides/
├── app/
│   ├── components/
│   │   └── DemoSlidesEditor.tsx   # основной интерфейс редактора
│   ├── export/
│   │   ├── google.ts              # получение Google OAuth-токена
│   │   └── pptx.ts                # генерация PPTX и загрузка в Google Drive
│   ├── privacy/
│   │   └── page.tsx               # политика конфиденциальности Google OAuth
│   ├── design-system.css           # стили элементов управления
│   ├── domain.ts                   # типы презентации, слайдов и блоков
│   ├── globals.css                 # глобальные стили редактора
│   ├── layout.tsx                  # корневой layout
│   ├── page.tsx                    # главная страница
│   └── repository.ts               # сохранение и загрузка проекта
├── public/
│   └── device-frames/              # изображения рамок устройств
├── worker/
│   └── index.ts                    # Cloudflare Worker entry point
├── tests/                          # автоматические проверки
├── Dockerfile                      # сборка production-образа
├── compose.yaml                    # запуск через Docker Compose
├── .env.example                    # пример локальных переменных
├── .env.docker.example             # пример переменных для Docker
└── DOCKER.md                       # расширенная инструкция по Docker
```

## Локальный запуск

### Требования

- Node.js `22.13` или новее;
- npm.

Клонируйте репозиторий и перейдите в его директорию:

```bash
git clone https://github.com/Agaverd/lego-slides.git
cd lego-slides
```

Установите зависимости:

```bash
npm install
```

Создайте локальный файл окружения:

```bash
cp .env.example .env.local
```

В Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Запустите dev-сервер:

```bash
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000).

## Запуск в Docker Compose

Создайте `.env` из примера:

```bash
cp .env.docker.example .env
```

Соберите и запустите контейнер:

```bash
docker compose up -d --build
```

Приложение будет доступно на [http://localhost:3000](http://localhost:3000).

Посмотреть состояние и логи:

```bash
docker compose ps
docker compose logs -f
```

Остановить контейнеры:

```bash
docker compose down
```

Публичный порт можно изменить в `.env`:

```dotenv
DEMO_SLIDES_PORT=3001
```

После следующего запуска приложение будет доступно на `http://localhost:3001`.

## Сборка и запуск Docker-образа вручную

Находясь в корне репозитория, выполните:

```bash
docker build -t lego-slides:local .
docker run -d --name lego-slides --restart unless-stopped -p 3001:3000 lego-slides:local
```

Обратите внимание: `3001` — порт компьютера или VPS, а `3000` — порт приложения внутри контейнера.

Проверить контейнер:

```bash
docker ps
docker logs -f lego-slides
curl http://localhost:3001
```

## Google Slides

Экспорт в PowerPoint работает без дополнительных настроек. Для экспорта в Google Slides нужен публичный OAuth Client ID типа `Web application`. Client Secret в браузерное приложение добавлять не нужно.

### Как получить Google OAuth Client ID

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) и создайте новый проект либо выберите существующий.
2. В разделе `APIs & Services → Library` включите [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com). Текущая реализация загружает PPTX через Drive API и конвертирует его в Google Slides.
3. Откройте `Google Auth Platform → Branding` и заполните название приложения, email поддержки и контактный email.
4. В разделе `Audience` выберите `External`, если приложением будут пользоваться разные Google-аккаунты. Пока приложение находится в режиме тестирования, добавьте нужные аккаунты в `Test users`.
5. В разделе `Data Access` добавьте scope:

   ```text
   https://www.googleapis.com/auth/drive.file
   ```

6. Откройте `Google Auth Platform → Clients`, нажмите `Create client` и выберите тип `Web application`.
7. Добавьте точные адреса приложения в `Authorized JavaScript origins`, например:

   ```text
   http://localhost:3000
   http://localhost:3001
   https://slides.example.com
   ```

   Порт должен совпадать с адресом, по которому пользователь открывает приложение. Wildcard-адреса не поддерживаются. Для production используйте домен с HTTPS: Google не разрешает обычный внешний IP-адрес в качестве JavaScript origin, исключение сделано только для localhost.

8. `Authorized redirect URIs` для используемой popup/token-модели можно оставить пустым.
9. Нажмите `Create` и скопируйте Client ID вида:

   ```text
   1234567890-abcdefgh.apps.googleusercontent.com
   ```

Документация Google: [создание Web Client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [OAuth для браузерных приложений](https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow).

### Локальный запуск без Docker

Создайте в корне репозитория файл `.env.local`:

```dotenv
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefgh.apps.googleusercontent.com
```

После изменения `.env.local` полностью перезапустите сервер:

```bash
npm run dev
```

### Запуск через Docker Compose

Создайте рядом с `compose.yaml` файл `.env`:

```dotenv
VITE_GOOGLE_CLIENT_ID=1234567890-abcdefgh.apps.googleusercontent.com
DEMO_SLIDES_PORT=3001
```

Значение `VITE_GOOGLE_CLIENT_ID` встраивается во время сборки. После его изменения Docker-образ нужно пересобрать:

```bash
docker compose down
docker compose up -d --build
```

После запуска приложение будет доступно на `http://localhost:3001`.

### Ручная сборка Docker-образа

Если Docker Compose не используется, передайте Client ID как build argument:

```bash
docker build --build-arg VITE_GOOGLE_CLIENT_ID="1234567890-abcdefgh.apps.googleusercontent.com" -t lego-slides:local .
docker run -d --name lego-slides -p 3001:3000 lego-slides:local
```

Для VPS привяжите домен, настройте reverse proxy и HTTPS, добавьте итоговый адрес вида `https://slides.example.com` в `Authorized JavaScript origins`, а затем пересоберите образ. Одного добавления переменной окружения уже запущенному контейнеру недостаточно.

## Команды проекта

```bash
npm run dev          # локальный сервер разработки
npm run build        # production-сборка
npm start            # запуск готовой production-сборки
npm run lint         # проверка ESLint
npx tsc --noEmit     # проверка TypeScript
npm test             # сборка и автоматические тесты
```

## Данные и безопасность

- проект презентации сохраняется локально в браузере;
- Google OAuth-токен используется только для экспорта и не сохраняется на сервере;
- файлы `.env` и `.env.local` исключены из Git;
- авторизация через ChatGPT в проекте не используется.

Дополнительная инструкция по серверному запуску находится в [DOCKER.md](./DOCKER.md).
