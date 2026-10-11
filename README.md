# Folio

Folio is a responsive private workspace for managing files, presentations, and other digital documents. The full stack uses JavaScript: React and Vite power the interface, Express provides the API, and SQLite stores metadata. This keeps local setup simple and avoids a separate database service.

## Run locally

Requirements: Node.js 20 or newer and npm.

1. Open a terminal in the project folder and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Start the app with `npm run dev`.
4. Open the Vite address printed in the terminal (usually `http://localhost:5173`). Local development opens Folio without a sign-in screen and listens only on your PC.

To require a key locally, set `AUTH_ENABLED=true` and a strong `APP_TOKEN` in `.env`. Production always requires `APP_TOKEN` and listens on the host interface for deployment.

For a production build, run `npm run build` and then `npm start`. Express serves the built interface and API on port 3001 by default. Set `PORT` to change it.

## Features

- The **All files** view shows your folders. Open a folder to view its files; the current folder's complete file list appears without pagination. Select a file type to filter the current view.
- Upload up to 20 files per batch with upload progress and clear success/error messages.
- Drag files or folders onto the workspace to upload them. Folder drops preserve nested folders in supported browsers.
- Accept PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, ZIP archives, MP4/WebM/MOV videos, and source/configuration text files for common languages including JavaScript, TypeScript, Python, Java, C/C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, SQL, shell, PowerShell, HTML, CSS, JSON, XML, YAML, and more. Folio sets no per-file or total storage quota; available server disk space is the limit.
- Check file extensions and basic file signatures before accepting uploads. Files use random server-generated storage names.
- Preview PDFs, common raster images, MP4/WebM/MOV videos, and text files. Video playback depends on the codecs supported by the browser. Read the text and cell contents of DOCX, XLSX, and PPTX files without an Office service; edit and save supported source-code, TXT, Markdown, and CSV files in the workspace. Source files are displayed as plain text and are never executed by Folio.
- Create nested folders, rename folders, move and rename files, edit tags, star files, and delete with confirmation.
- Hide files from regular workspace views and restore them from the dedicated **Hidden** section. Create folders and subfolders inside Hidden; files uploaded there are protected automatically. The first visit sets a password; Folio stores a salted hash in SQLite and protects hidden names and contents behind an expiring session. Hidden files remain stored and count toward disk usage.
- Filter by file type, size, and date added/modified. Sort by name, type, size, date added, or last modified.
- View details including file type, size, upload date, and last modified date. Switch between grid and list layouts.
- Upload, organize, and download ZIP archives. Folio does not unpack or preview archive contents.
- Protect the API and file contents with a workspace access key and an HTTP-only, same-site session cookie when authentication is enabled. Local development skips sign-in by default and binds the API to loopback.

## Project structure

- `src/main.jsx` — React workspace, upload flow, file actions, previews, and dialogs.
- `src/style.css` — responsive desktop and mobile interface styles.
- `server/index.js` — API authentication, file validation, local file storage, and SQLite operations.
- `data/folio.sqlite` — metadata database, created automatically.
- `data/files/` — uploaded file contents, stored using random names.
- `.env.example` — configuration template.

## Configuration

Local development does not require `APP_TOKEN`. Set `AUTH_ENABLED=true` and a strong `APP_TOKEN` in `.env` if you want to require sign-in locally. Production always requires `APP_TOKEN`; keep it private and use a strong, unique value. `PORT`, `DATA_DIR`, and `CORS_ORIGIN` are optional. `DATA_DIR` should point to a persistent, access-controlled location for the database and uploaded files. Keep `.env` private.

## Online deployment

`render.yaml` defines a Render web service with a persistent disk for uploaded files and SQLite, plus a generated `APP_TOKEN`. Connect this GitHub repository to Render and create a Blueprint from the file to deploy. This configuration uses a paid web service and disk. Render's free web services do not retain local files across restarts, deploys, or spin-downs, so they are not suitable for keeping Folio uploads.

The hosted URL is reachable from the internet; production authentication protects file access. Keep the generated `APP_TOKEN` private and set a strong unique key if you replace it.

### Office document previews

Folio can extract readable text from DOCX and PPTX files and cell values from XLSX files without external services. This is a content view and does not preserve the original Office layout. Use PDF files when you need a fixed page appearance. TXT, Markdown, and CSV files can still be edited in Folio.

## Limits and deployment

- The current interface does not include a search bar or a dedicated Starred section. Files can still be tagged and starred from file actions, but starred files are not shown in a separate view.
- DOCX, XLSX, and PPTX previews show extracted text and cell values only. Original Office layout rendering and editing Office files are not included. PDF files can be previewed with their saved appearance. Older DOC/XLS/PPT files can be downloaded and opened in a compatible desktop app.
- This starter app uses one shared access key for a single workspace when authentication is enabled. Local development is intended for use on the same PC and skips sign-in by default. Multi-user accounts, per-user permissions, audit history, and cloud storage need additional services and production authentication.
- For public internet deployment, add HTTPS, rate limiting, malware scanning, content inspection, backups, and stronger account/session management.
- Upload signatures are checked for common file families. Office Open XML files are checked for ZIP signatures, not fully inspected internally.
- Folder selection uses the browser's directory picker. Folder drag and drop uses the Chromium folder-entry API (Chrome and Edge); the folder picker is the fallback when a browser cannot expose dropped folders.
