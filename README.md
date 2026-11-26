# Student Fee Tracker

Student Fee Tracker is a vanilla JavaScript and Bootstrap frontend connected to the FreeProjectAPI Fees Tracking service. It uses the local Node.js proxy during development and calls the provider directly when hosted as a static site such as GitHub Pages.

## API connection

- Base URL: `https://api.freeprojectapi.com`
- Enrollment and student fee records use `/api/FeesTracking/getAllEnrollments`, `/{id}`, `/addNewEnrollment`, `/updateEnrollment`, `/SoftDeleteById`, and `/DeleteById`.
- Batch records use `/api/FeesTracking/batches` and `/api/FeesTracking/batches/{id}`.
- The API contract is published in the provider's [Fees Tracking API documentation](https://freeprojectapi.com/apis/fees-tracking/) and live [OpenAPI document](https://api.freeprojectapi.com/swagger/v1/swagger.json).

The app loads current enrollments and batches when a page opens. Student and batch creates, edits, deletes, restores, and fee payment totals are sent to the API. For local development, start the included proxy with Node.js:

```sh
node server.js
```

Then visit `http://localhost:8000/`. Set `PORT` to use a different port.

## Data supported by this API

The API stores a student's name, contact number, batch, total fee, three installment amounts, total received, status, and deleted flag. Batch records contain a name only. Course name, batch schedule, student email/address, and registration dates are not part of this API schema and are not saved by the app.

The service has no payment transaction endpoint. The total received is updated on the API, while payment receipts (date, amount, method, and note) are kept in the current browser's `localStorage`. Receipt history is therefore browser-specific and is not shared between browsers. Existing API totals cannot be reconstructed into individual receipt history.

On GitHub Pages and other non-local hosts, the browser client uses `https://api.freeprojectapi.com` directly. The provider currently responds to browser CORS requests. The local Node.js proxy remains available for development and deployments where a server-side proxy is preferred.

## Shared practice service

The provider describes this as a practice API. Its records are shared with other users, and these endpoints do not provide account-level isolation for this app. Use synthetic coursework data only. Creating or changing records affects the live shared service. Availability and browser CORS access are controlled by the provider.
