# Student Fee Tracker

A front-end Student Fee Tracking System built with HTML5, CSS3, vanilla JavaScript, Bootstrap 5, Bootstrap Icons, Chart.js, and LocalStorage.

## Project Structure

- `index.html` - main entry page
- `pages/` - application HTML pages
- `assets/css/` - stylesheets
- `assets/js/` - JavaScript modules
- `assets/images/` - project images

No backend or API integration is included.

## LocalStorage foundation

The reusable browser storage API is in `assets/js/storage.js` and is exposed as `window.FeeTrackStorage`. Load it before scripts that use student, batch, or payment records. It stores those collections and settings under separate `feetTrack_*` keys. `clearAllData()` removes only these FeeTrack keys; corrupted JSON is reported and left untouched.

Student contact numbers accept Sri Lankan mobile formats: `07XXXXXXXX` or `+947XXXXXXXX` (spaces, hyphens, and parentheses are normalized).

Optional demonstration records are defined separately in `assets/js/sample-data.js`. Load that script after `storage.js` and call `window.FeeTrackSampleData.initializeSampleData()` explicitly to seed empty collections. Loading either file alone does not insert data. Repeated payment submissions with identical details are treated as retries when no payment ID is supplied; pass a distinct ID for an intentionally identical transaction.

Run the storage tests with:

```sh
node --test tests/storage.test.js
```
