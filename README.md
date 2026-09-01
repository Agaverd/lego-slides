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

Экспорт в PowerPoint работает без дополнительных настроек. Для экспорта в Google Slides нужен OAuth Client ID типа `Web application`.

Укажите его в `.env.local` для локального запуска:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Для Docker добавьте его в `.env` до сборки:

```dotenv
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

В Google Cloud Console необходимо:

1. включить Google Drive API;
2. создать OAuth Client ID типа `Web application`;
3. добавить адрес приложения в `Authorized JavaScript origins`, например `http://localhost:3000` для локальной разработки и `https://slides.example.com` для сервера.

Значение `VITE_GOOGLE_CLIENT_ID` встраивается во время сборки. После его изменения Docker-образ нужно пересобрать:

```bash
docker compose up -d --build
```

Для публичного сервера рекомендуется использовать домен, reverse proxy и HTTPS. Авторизация Google через обычный HTTP-адрес VPS может не работать.

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
