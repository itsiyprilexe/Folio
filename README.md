# Folio

Folio is a responsive private workspace for managing files, presentations, and other digital documents. The full stack uses JavaScript: React and Vite power the interface, Express provides the API, and SQLite stores metadata. This keeps local setup simple and avoids a separate database service.

## Run locally

Requirements: Node.js 20 or newer and npm.

1. Open a terminal in the project folder and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `APP_TOKEN` in `.env` to a long, private access key.
4. Start the app with `npm run dev`.
5. Open the Vite address printed in the terminal (usually `http://localhost:5173`) and enter your access key.

For a production build, run `npm run build` and then `npm start`. Express serves the built interface and API on port 3001 by default. Set `PORT` to change it.

## Features

- Upload up to 20 files per batch with upload progress and clear success/error messages.
- Upload a folder with the **Upload folder** picker (preserves nested folders), or drag files/folders onto the workspace where the browser supports it.
- Accept PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, PNG, JPG/JPEG, GIF, WEBP, SVG, TXT, Markdown, and CSV files. Folio sets no per-file or total storage quota; available server disk space is the limit.
- Check file extensions and basic file signatures before accepting uploads. Files use random server-generated storage names.
- Preview PDFs, common raster images, and text files. Read the text and cell contents of DOCX, XLSX, and PPTX files without an Office service; edit and save TXT, Markdown, and CSV files in the workspace.
- Create nested folders, rename folders, move and rename files, edit tags, star files, and delete with confirmation.
- Search names and tags across the workspace. Search also indexes TXT, Markdown, and CSV content (up to the first 1 MB of each file).
- Filter by file type, size, and date added/modified. Sort by name, type, size, date added, or last modified.
- View details including file type, size, upload date, and last modified date. Switch between grid and list layouts.
- Protect the API and file contents with a workspace access key and an HTTP-only, same-site session cookie.

## Project structure

- `src/main.jsx` — React workspace, upload flow, file actions, previews, and dialogs.
- `src/style.css` — responsive desktop and mobile interface styles.
- `server/index.js` — authenticated API, file validation, local file storage, and SQLite operations.
- `data/folio.sqlite` — metadata database, created automatically.
- `data/files/` — uploaded file contents, stored using random names.
- `.env.example` — configuration template.

## Configuration

`APP_TOKEN` is required. `PORT`, `DATA_DIR`, and `CORS_ORIGIN` are optional. `DATA_DIR` should point to a persistent, access-controlled location for the database and uploaded files. Keep `.env` private.

### Office document previews

Folio can extract readable text from DOCX and PPTX files and cell values from XLSX files without external services. This is a content view and does not preserve the original Office layout. Use PDF files when you need a fixed page appearance. TXT, Markdown, and CSV files can still be edited in Folio.

## Limits and deployment

- Full-text search is available for TXT, Markdown, and CSV only. Searching inside PDF and Office documents needs a text extraction/indexing service.
- DOCX, XLSX, and PPTX previews show extracted text and cell values only. Original Office layout rendering and editing Office files are not included. PDF files can be previewed with their saved appearance. Older DOC/XLS/PPT files can be downloaded and opened in a compatible desktop app.
- This starter app uses one shared access key for a single workspace. Multi-user accounts, per-user permissions, audit history, and cloud storage need additional services and production authentication.
- For public internet deployment, add HTTPS, rate limiting, malware scanning, content inspection, backups, and stronger account/session management.
- Upload signatures are checked for common file families. Office Open XML files are checked for ZIP signatures, not fully inspected internally.
- Folder selection uses the browser's directory picker. Folder drag and drop uses the Chromium folder-entry API (Chrome and Edge); the folder picker is the fallback when a browser cannot expose dropped folders.
