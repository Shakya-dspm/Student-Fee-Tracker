# Student Fee Tracker

A front-end Student Fee Tracking System built with HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Bootstrap Icons, Chart.js, and LocalStorage.

## Project Structure

- `index.html` - main entry page
- `pages/` - application HTML pages
- `assets/css/` - stylesheets
- `assets/js/` - JavaScript modules
- `assets/images/` - project images

No backend or API integration is included.

## Run the application

Serve this folder from one local web origin so every page shares the same browser LocalStorage. From the project root, run:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000/`. Stop the static server with `Ctrl+C`. Avoid opening individual HTML files with `file://`, because browsers may isolate or restrict storage for file URLs.

## First-time setup

The application does not create demo records automatically. On an empty workspace, create a batch first from **Batches**, then register students from **Students**. The dashboard, fee list, payment form, and reports will guide you to the next action when their required records are missing. Record a payment from **Payment History** or the **Fee Management** balance list.

## LocalStorage foundation

The reusable browser storage API is in `assets/js/storage.js` and is exposed as `window.FeeTrackStorage`. Load it before scripts that use student, batch, or payment records. It stores those collections and settings under separate `feetTrack_*` keys. `clearAllData()` removes only these FeeTrack keys; corrupted JSON is reported and left untouched.

Student contact numbers accept Sri Lankan mobile formats: `07XXXXXXXX` or `+947XXXXXXXX` (spaces, hyphens, and parentheses are normalized).

## Student management

The student directory and profile pages are in `pages/students.html` and `pages/student-details.html`. They use the existing `window.FeeTrackStorage` methods for student records, batches, payments, and soft deletion. Student records also accept optional email and address fields plus a registration date; records created before these fields were added continue to use `createdAt` as the registration-date fallback.

Students must be assigned to an existing batch. The student pages do not seed sample data or create payment transactions.

Optional demonstration records are defined separately in `assets/js/sample-data.js`. Load that script after `storage.js` and call `window.FeeTrackSampleData.initializeSampleData()` explicitly to seed empty collections. Loading either file alone does not insert data, and initialization leaves existing non-empty collections untouched. The payment form assigns each submitted transaction a unique ID, so two legitimate payments with identical details can both be recorded.

The Fee Management page summarizes balances by student. Reports provides current status and batch summaries, monthly collections, and a CSV export. Dashboard charts and summaries use the same LocalStorage records as the management pages.

Run the storage tests with:

```sh
node --test tests/storage.test.js
```
