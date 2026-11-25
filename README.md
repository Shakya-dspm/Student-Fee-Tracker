# Student Fee Tracker

Student Fee Tracker helps you organize student enrollment and keep track of course fees and payments in one place.

## What you can do

- **See the overall picture:** The dashboard summarizes enrolled students, expected fees, payments received, and outstanding balances. Charts and recent activity reflect your saved records.
- **Manage batches:** Create and update batches, review their students, and find batches with search and filters. A batch cannot be removed while students are assigned to it.
- **Keep student records:** Register students in a batch, update their details, and find them by name, ID, batch, or payment status. Student profiles show fee balances and payment history. Deleted students can be restored, and their payment history is retained.
- **Track fee balances:** The Fee Management page shows each active student's course fee, amount paid, remaining balance, and payment status.
- **Record payments:** Accept partial or full payments using the available payment methods. The tracker checks the amount against the student's remaining balance and updates their balance and payment history after a successful receipt.
- **Review and export reports:** Compare payment statuses and batch totals, review monthly collections, and download a CSV report.
- **Search and move between records:** Use the dashboard search and page filters to find students, batches, and payments, then open related profiles and histories.

## Getting started

1. Open the Dashboard. On a new workspace, follow its setup prompt to create a batch.
2. Register students and assign each one to an existing batch.
3. Open **Fee Management** to review balances, or choose **Payment History** to record a payment.
4. Visit **Reports** to review collections or export a CSV summary.

On a fresh browser workspace, the app automatically loads sample batches, students, and payments so every section has records to demonstrate. The sample data is only added when all record collections are empty; existing records are never replaced.

## Open the app

Run the project from a local web server, then open its address in your browser. For example, from the project folder you can run:

```sh
python -m http.server 8000
```

Then visit `http://localhost:8000/`.

## Your records

The tracker saves records in the browser where you use it. They remain available when you return to the app in that browser, but are not automatically shared with another browser or device.
