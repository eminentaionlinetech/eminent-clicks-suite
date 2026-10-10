# Eminent Clicks App

BUILD A COMPLETE PRODUCTION-READY SAAS APPLICATION: EMINENT CLICKS

You are Lovable's senior product engineer, full-stack developer, SaaS architect, UI/UX designer, database architect, security engineer and QA engineer.

Build a complete, production-ready web application called:

EMINENT CLICKS

This application must be built ENTIRELY USING LOVABLE CLOUD.

CRITICAL ARCHITECTURE RULE

DO NOT USE FIREBASE.

Do not install Firebase.

Do not configure Firebase.

Do not import Firebase SDKs.

Do not create Firebase Authentication.

Do not create Firebase Firestore.

Do not create Firebase Storage.

Do not create Firebase Cloud Functions.

Do not create a Firebase dependency anywhere in the application.

Use Lovable Cloud and its native backend capabilities for:

- Authentication
- Database
- File storage
- Server-side logic
- Backend functions
- Security
- Real-time data where supported
- User sessions
- Persistent application data

Do not create fake replacements for backend functionality.

Use Lovable Cloud as the actual source of truth.

The application must work as a real application, not a prototype.

---

1. PRODUCT

Eminent Clicks is a unified business SaaS platform containing five independent business tools:

1. SubTrack
2. JobFlow
3. PayChaser
4. ReportSnap
5. ClaimDesk

Users create ONE account and access all five tools from one central dashboard.

Each tool is independently subscribed to and activated.

A user may activate:

- only one tool
- several tools
- or all five tools

---

2. ABSOLUTE PRODUCT PRINCIPLE

The most important rule in this entire project is:

NEVER FAKE ANYTHING.

If the user has not done something, the application must never pretend that they have.

Never fabricate:

- Users
- Customers
- Jobs
- Quotes
- Invoices
- Payments
- Subscriptions
- Expenses
- Claims
- Reports
- Revenue
- Profit
- Notifications
- Reminders
- Receipts
- Transactions
- Analytics
- Admin payment submissions

Never use fake records to make dashboards look populated.

Never use fake statistics.

Never use fake charts.

Never use fake payment confirmations.

Never use fake upload progress.

Never use fake admin activity.

---

3. EMPTY ACCOUNT RULE

When a user creates an account for the first time:

All five tools must be empty and locked.

The user should see:

SubTrack

0 subscriptions
₦0 monthly spending

JobFlow

0 jobs
0 quotes
0 scheduled jobs

PayChaser

0 invoices
₦0 outstanding

ReportSnap

0 sales
₦0 expenses
₦0 profit

ClaimDesk

0 claims
₦0 claimed

These values must come from actual application state/database queries.

Do not hardcode fake activity.

---

4. DEMO DATA RULE

Do not seed fake data into real user accounts.

If Lovable needs sample content while building the interface, use isolated static design examples only.

Do not insert demo records into the production database.

Do not allow sample records to affect:

- User dashboards
- Analytics
- Reports
- Payment queues
- Admin statistics
- Billing
- Notifications

If a demonstration mode is created, clearly label it:

DEMO DATA — NOT YOUR ACCOUNT DATA

---

5. LOVABLE CLOUD ONLY

All persistent backend functionality must use Lovable Cloud.

Use Lovable Cloud for:

Authentication

- Sign up
- Login
- Logout
- Password reset
- Sessions
- User identity

Database

Store:

- User profiles
- Payment submissions
- Tool subscriptions
- Jobs
- Quotes
- Invoices
- Business subscriptions
- Financial transactions
- Reports
- Claims
- Notifications
- Audit logs

File storage

Store:

- Payment receipts
- Job photos
- Claim documents
- Claim receipts
- Other authorized user uploads

Backend/server-side logic

Use Lovable Cloud backend functionality for operations that should not be trusted to the browser.

Security

Enforce:

- Authentication
- User ownership
- Admin permissions
- Data isolation
- File access restrictions

---

6. DO NOT BUILD A FAKE BACKEND

Do not use:

- local arrays as a database
- mock JSON as persistent data
- hardcoded records
- localStorage as the primary database
- sessionStorage as the database
- fake API responses
- artificial payment records

Local browser state may be used only for temporary UI state.

Persistent business data must use Lovable Cloud.

---

7. BRAND

Brand:

EMINENT CLICKS

Main tagline:

One login. Pay once. Unlock your tool.

Supporting statement:

Business tools designed to help you manage jobs, invoices, subscriptions, financial reports and claims from one place.

Important:

The tagline must not misrepresent the actual payment verification process.

The actual flow is:

Transfer → Upload Receipt → Admin Verification → Tool Unlock

Therefore, after receipt upload, never tell the user:

"Your tool is unlocked."

Instead say:

Payment submitted — awaiting verification.

After approval:

Payment approved — your tool is now unlocked.

---

8. DESIGN DIRECTION

Create a premium, modern SaaS product.

The application should look professionally designed by an experienced product design team.

Design characteristics:

- Clean
- Modern
- Professional
- Trustworthy
- Business-focused
- Responsive
- Easy to understand
- Visually polished
- Strong typography
- Consistent spacing
- Clear hierarchy
- Subtle shadows
- Professional cards
- Elegant icons
- Smooth transitions
- Excellent empty states

Do not overuse:

- gradients
- glassmorphism
- excessive animations
- glowing effects
- oversized decorative elements

The product should look like a real commercial SaaS application, not an AI-generated template.

---

9. RESPONSIVE DESIGN

Build mobile-first.

Support:

- Android phones
- iPhones
- Tablets
- Laptops
- Desktop monitors

On mobile:

- Use a responsive navigation drawer
- Make cards stack properly
- Make forms easy to complete
- Make payment receipt upload easy
- Make modals fit the screen
- Make tables responsive
- Make charts readable
- Use touch-friendly buttons
- Avoid tiny text

The entire application must remain usable on small screens.

---

10. PUBLIC LANDING PAGE

Create a professional public homepage.

Hero

Eminent Clicks

One login. Pay once. Unlock your tool.

Supporting copy:

Simple, powerful business tools for managing jobs, payments, subscriptions, financial reports and claims from one platform.

Buttons:

Get Started

Explore Tools

---

11. LANDING PAGE SECTIONS

Include:

Hero

How It Works

1. Create your account
2. Choose your tool
3. Make your bank transfer
4. Upload your receipt
5. Wait for verification
6. Start using your tool

Our Tools

Display all five tools.

Pricing

Display the actual prices.

Why Eminent Clicks

Explain:

- One account
- Independent tools
- Secure business records
- Simple workflows
- Mobile-friendly experience
- Real-time status updates

Payment Verification

Clearly explain that payment receipts are reviewed before tool activation.

FAQ

Footer

---

12. THE FIVE TOOLS

SUBTRACK

Price:

₦5,000

Subscription and recurring expense tracker.

---

JOBFLOW

Price:

₦10,000

Job and trade business management.

---

PAYCHASER

Price:

₦10,000

Invoice and outstanding payment management.

---

REPORTSNAP

Price:

₦10,000

Business financial reporting and analytics.

---

CLAIMDESK

Price:

₦10,000

Business expense and insurance claim management.

---

13. AUTHENTICATION

Use Lovable Cloud's native authentication.

Create:

Registration

Fields:

- Full name
- Email
- WhatsApp/phone number
- Password
- Confirm password

Login

Fields:

- Email
- Password

Forgot Password

Implement a real password recovery flow.

Logout

Implement real session logout.

Do not create fake authentication.

Do not create a demo login.

---

14. USER PROFILE

Create a user profile in the Lovable Cloud database.

Store appropriate information:

- User ID
- Full name
- Email
- WhatsApp number
- Created date
- Updated date

Never store plaintext passwords.

---

15. APPLICATION ROUTING

Create clean routes such as:

/
 /login
 /register
 /forgot-password
 /dashboard
 /billing
 /settings

 /subtrack
 /jobflow
 /paychaser
 /reportsnap
 /claimdesk

 /admin
 /admin/payments

Private routes must require authentication.

Admin routes must require admin authorization.

---

16. MAIN DASHBOARD

After login:

Show:

Welcome to Eminent Clicks

Then show all five tools.

Every tool card must display its REAL current state.

---

17. TOOL STATUS SYSTEM

Possible states:

LOCKED

🔒 LOCKED

Subscribe to unlock

[Subscribe]

---

PAYMENT PENDING

🟡 PAYMENT VERIFICATION PENDING

[View Submission]

---

UNLOCKED

🟢 UNLOCKED

[Open]

---

REJECTED

🔴 PAYMENT REJECTED

[View Details]

[Resubmit]

---

EXPIRED

Only show this state if the billing model actually includes expiration.

Do not invent expiry dates.

---

18. PRICING

Centralize the prices.

SubTrack = ₦5,000
JobFlow = ₦10,000
PayChaser = ₦10,000
ReportSnap = ₦10,000
ClaimDesk = ₦10,000

The selected tool must automatically determine the expected amount.

The user must not be able to manipulate the price through frontend code.

The server/backend must validate the correct price.

---

19. PAYMENT WORKFLOW

When the user clicks Subscribe:

Open a beautiful payment modal.

Display:

- Tool name
- Price
- Bank transfer details
- Receipt upload
- Email
- WhatsApp number
- Payment instructions

Do not unlock the tool at this stage.

---

20. BANK TRANSFER DETAILS

Display:

BANK TRANSFER DETAILS

Bank Name: Kuda Bank

Account Name: Okechukwu Chimaobi Destiny

Account Number: 2088333205

Instruction:

Transfer the displayed amount and upload your payment receipt.

Then:

Your tool will be activated after payment verification.

The displayed amount must dynamically match the selected tool.

---

21. PAYMENT FORM

Fields:

Email *

Default to the authenticated user's email.

WhatsApp Number *

Default to the user's profile number where available.

Receipt *

Accepted:

- JPG
- JPEG
- PNG

Display:

- File name
- File size
- Image preview
- Remove/change button

---

22. RECEIPT VALIDATION

Validate:

- File exists
- File type
- File size
- Valid image
- Reasonable image dimensions

If invalid:

Show a clear error.

Example:

Please upload a valid JPG or PNG receipt.

Do not upload invalid files.

---

23. RECEIPT IMAGE COMPRESSION

Compress the image before uploading.

The purpose is:

- Faster uploads
- Lower storage usage
- Better mobile performance

Maintain sufficient readability.

Do not promise that every receipt will be compressed to a particular file size.

---

24. REAL UPLOAD PROGRESS

The upload progress must be REAL.

Do not create a fake timer.

Display:

Uploading receipt... 25%

Uploading receipt... 68%

Uploading receipt... 100%

Then:

Processing submission...

Then:

Receipt submitted successfully.

Only show success when the actual backend operations succeed.

---

25. FILE STORAGE

Use Lovable Cloud's native storage functionality.

Recommended conceptual structure:

receipts/{userId}/{paymentId}/receipt

Protect uploaded files.

A normal user must not be able to access another user's receipt.

Administrators should only access receipts required for payment verification.

---

26. PAYMENT DATABASE

Create a payment/submission table in Lovable Cloud.

Suggested fields:

- id
- userId
- email
- whatsappNumber
- toolId
- toolName
- amount
- currency
- trackingCode
- receiptFilePath
- status
- submittedAt
- reviewedAt
- reviewedBy
- rejectionReason
- createdAt
- updatedAt

Use appropriate database types.

Do not duplicate unnecessary user data.

---

27. PAYMENT STATUS

Use canonical backend values:

pending
approved
rejected

Display:

- Pending
- Approved
- Rejected

Do not use inconsistent status names.

---

28. TRACKING CODE

Every payment submission receives a unique tracking code.

Format EXACTLY:

EC-NGN-[4 random digits]-[4 random digits]

Example:

EC-NGN-4821-7354

The tracking code must be unique.

Prefer generating it using secure server-side/backend logic.

Check for collisions.

---

29. PAYMENT SUCCESS SCREEN

After successful submission:

Receipt Uploaded Successfully

Your payment is awaiting admin verification.

Display:

- Tool
- Amount
- Tracking code
- Submission date
- Status

Example:

EC-NGN-4821-7354

Do not claim approval.

Do not unlock the tool yet.

---

30. PAYMENT HISTORY

Create a Billing/Payment History page.

Display real submissions.

Columns/cards:

- Tool
- Amount
- Tracking code
- Date
- Status
- Rejection reason if applicable

If there are none:

No payment submissions yet.

---

31. ADMIN ACCESS

You may implement hidden admin-entry shortcuts.

Option 1

"?admin=true"

Option 2

Triple-tap "My Dashboard" within two seconds.

Option 3

Long-press the round logo for 1.5 seconds.

IMPORTANT:

These are ONLY navigation/UX shortcuts.

They do NOT authenticate the administrator.

---

32. ADMIN AUTHENTICATION

Use Lovable Cloud authentication.

Create a real administrator role.

The role must be enforced by the backend/database authorization system.

Do NOT rely on:

- URL parameters
- localStorage
- frontend variables
- hidden buttons
- CSS
- email strings alone

for admin authorization.

---

33. ADMIN DASHBOARD

Create:

"/admin"

Only authorized administrators can access it.

Admin dashboard must display actual payment submissions.

---

34. ADMIN ANALYTICS

Display:

Total Uploads

Actual payment submissions.

Pending

Actual pending payments.

Approved

Actual approved payments.

Rejected

Actual rejected payments.

If there are no submissions:

Total Uploads: 0
Pending: 0
Approved: 0
Rejected: 0

Do not fabricate numbers.

---

35. ADMIN PAYMENT SEARCH

Provide search by:

- Tracking code
- Email
- Tool

Search real database records.

---

36. ADMIN FILTERS

Status:

- All
- Pending
- Approved
- Rejected

Tool:

- All
- SubTrack
- JobFlow
- PayChaser
- ReportSnap
- ClaimDesk

---

37. ADMIN PAYMENT CARD

Each real submission displays:

- Receipt thumbnail
- Email
- WhatsApp number
- Tool
- Amount
- Tracking code
- Submission date
- Status

Actions:

View Receipt

Approve

Reject

Only show actions that make sense for the current status.

---

38. ADMIN RECEIPT VIEWER

Create a secure full-screen receipt viewer.

Include:

- Receipt image
- Zoom where practical
- Close button
- Mobile support

Do not expose receipts publicly.

---

39. ADMIN APPROVAL

When the administrator clicks Approve:

Show a confirmation.

Then perform a secure backend operation.

The operation must:

1. Verify the administrator.
2. Verify the payment exists.
3. Verify it is currently pending.
4. Verify the tool and amount.
5. Change payment status to approved.
6. Record reviewer.
7. Record review time.
8. Create or activate the user's tool entitlement.
9. Create an audit record.
10. Return the result to the UI.

Make this operation idempotent.

Approving twice must not create duplicate entitlements.

---

40. ADMIN REJECTION

When administrator clicks Reject:

Open a rejection dialog.

Capture a rejection reason.

Then:

1. Verify administrator permission.
2. Verify payment is pending.
3. Change status to rejected.
4. Record reviewer.
5. Record review timestamp.
6. Save rejection reason.
7. Create audit event.

Do not delete the payment submission.

---

41. NO FAKE ADMIN RECORDS

If there are no payments:

Display:

No Payment Submissions Yet

"Customer payment receipts will appear here when they are submitted."

No fake records.

No fake pending payments.

---

42. REAL-TIME STATUS UPDATES

Use Lovable Cloud's supported real-time/database functionality.

Important example:

Administrator approves payment.

↓

Backend updates payment.

↓

Backend activates entitlement.

↓

User dashboard receives the updated state.

↓

Tool changes from:

LOCKED

to:

UNLOCKED

This should happen without requiring a manual browser refresh where real-time support is available.

---

43. TOOL ACCESS CONTROL

Do not simply hide locked tools.

Every protected tool route must verify the user's actual entitlement.

For example:

If user visits:

"/jobflow"

without JobFlow access:

show the JobFlow subscription/locked page.

Never rely only on frontend navigation.

---

44. TOOL ENTITLEMENT MODEL

Create a secure tool access/subscription system.

Each entitlement should contain appropriate information such as:

- userId
- toolId
- status
- paymentId
- activatedAt
- expiresAt if applicable
- createdAt
- updatedAt

Only authorized backend/admin operations can activate it.

---

45. BILLING MODEL

Do not invent a billing frequency that has not been decided.

The architecture must support a configurable billing model.

If these prices are eventually monthly subscriptions:

store:

- billing period
- activation date
- expiration date
- renewal state

If these prices are one-time activation fees:

do not create artificial monthly expiration.

Keep billing rules centralized so they can be changed later.

---

46. SUBTRACK

Price: ₦5,000

Purpose:

Track recurring subscriptions and business expenses.

Dashboard

Calculate actual:

- Total subscriptions
- Monthly spending
- Annual spending
- Upcoming renewals
- Trials ending soon

Add Subscription

Fields:

- Subscription name
- Provider
- Cost
- Billing frequency
- Renewal date
- Category
- Notes
- Trial end date

List

Display:

- Service
- Provider
- Cost
- Frequency
- Category
- Renewal date
- Status

Categories

Examples:

- Software
- Business
- Productivity
- Cloud
- Marketing
- Other

Categories are configuration options, not fake subscriptions.

Empty State

No subscriptions yet.

[Add Subscription]

---

47. JOBFLOW

Price: ₦10,000

Purpose:

Manage jobs and trade/business work.

Statuses:

- New
- Quoted
- Scheduled
- In Progress
- Completed
- Invoiced

Dashboard

Calculate:

- Total jobs
- New
- Quoted
- Scheduled
- In Progress
- Completed
- Invoiced

Create Job

Fields:

- Client name
- Client phone
- Client email
- Job title
- Description
- Location
- Job date
- Status
- Notes
- Photos

Job Details

Show:

- Client
- Description
- Status
- Date
- Notes
- Photos
- Quote
- Invoice where applicable

Notes

Allow timestamped notes.

Photos

Store actual photos in Lovable Cloud storage.

Quotes

Create real quotes.

Fields:

- Client
- Description
- Line items
- Quantity
- Unit price
- Total
- Notes

Statuses:

- Draft
- Sent
- Approved
- Declined

Calendar

Display only actual scheduled jobs.

No fake calendar events.

---

48. PAYCHASER

Price: ₦10,000

Purpose:

Manage invoices and outstanding balances.

Dashboard

Calculate actual:

- Total invoices
- Unpaid amount
- Overdue amount
- Paid amount

Create Invoice

Fields:

- Customer
- Invoice number
- Amount
- Issue date
- Due date
- Description
- Notes

Statuses

- Draft
- Sent
- Unpaid
- Overdue
- Paid

Overdue must be calculated from actual dates.

Reminders

Support real reminder functionality.

Possible stages:

- Before due date
- Due date
- 3 days overdue
- 7 days overdue
- 14 days overdue

Do not show a reminder as "sent" unless the system actually sent/recorded it.

---

49. REPORTSNAP

Price: ₦10,000

Purpose:

Financial reporting and business analytics.

Do not create fake analytics.

Sales

Allow users to create actual sales records.

Expenses

Allow users to create actual expense records.

Transactions

Track actual financial transactions.

Dashboard

Calculate:

- Total sales
- Total expenses
- Profit
- Transaction count

Formula:

Profit = Sales - Expenses

Charts

Use actual data.

Possible charts:

- Sales over time
- Expenses over time
- Profit over time
- Category breakdown

If there is no data:

No financial data yet.

Do not draw fake chart values.

Date Filters

- Today
- This week
- This month
- This year
- Custom range

Reports

Create:

- Sales reports
- Expense reports
- Profit reports

Export

Allow actual reports to be exported where implemented.

Only show success after the export actually completes.

---

50. CLAIMDESK

Price: ₦10,000

Purpose:

Track business expenses and insurance claims.

Dashboard

Calculate:

- Total claims
- Submitted
- In Review
- Information Needed
- Approved
- Denied
- Paid
- Total claimed
- Total paid

Create Claim

Fields:

- Claimant where applicable
- Insurer where applicable
- Claim number
- Amount
- Submission date
- Status
- Description
- Notes

Statuses

- Submitted
- In Review
- Info Needed
- Approved
- Denied
- Paid

Documents

Allow actual receipt/document uploads.

Store securely in Lovable Cloud storage.

Timeline

Show actual:

- Creation
- Status changes
- Notes
- Document uploads
- Follow-ups

Reminders

Allow actual follow-up reminders.

---

51. DATABASE OWNERSHIP

Every private business record must belong to the authenticated user.

Use:

"userId"

as appropriate.

If multi-user organizations are later introduced, support:

"organizationId"

and roles.

Users must never be able to access another user's private records.

---

52. SECURITY

Implement Lovable Cloud's native security mechanisms.

Enforce authorization at the backend/database level.

Do not rely on frontend checks.

A user must not be able to modify:

- Payment approval status
- Admin status
- Tool entitlement
- Another user's records
- Reviewer information
- Another user's receipts

---

53. FILE SECURITY

Protect:

- Payment receipts
- Job photos
- Claim documents
- Other uploaded files

A user should only access files they are authorized to access.

Do not create public file URLs unnecessarily.

---

54. DATA VALIDATION

Validate all important forms.

Check:

- Required fields
- Email
- Phone number
- Amount
- Dates
- File types
- File sizes
- Invalid values

Show clear validation messages.

---

55. LOADING STATES

Every backend operation needs a loading state.

Examples:

- Signing in...
- Creating account...
- Uploading...
- Saving...
- Approving...
- Rejecting...
- Loading...
- Generating report...

Prevent duplicate submissions while an operation is running.

---

56. ERROR HANDLING

Every backend operation must handle errors.

Examples:

Unable to upload your receipt. Please try again.

Unable to save your job.

Unable to load your invoices.

Payment approval failed.

Never show success when the backend operation failed.

Do not expose technical backend errors to normal users.

---

57. SEARCH

Implement actual search.

JobFlow:

- Client
- Job title
- Status

PayChaser:

- Customer
- Invoice number
- Status

SubTrack:

- Service
- Provider
- Category

ClaimDesk:

- Claim number
- Claimant
- Insurer
- Status

---

58. FILTERING

Implement actual filters.

When no records match:

No records match your filters.

This is different from:

No records created yet.

---

59. NOTIFICATIONS

Build a real notification architecture.

Events may include:

- Payment submitted
- Payment approved
- Payment rejected
- Tool activated
- Invoice due
- Invoice overdue
- Subscription renewal
- Claim follow-up

Never create notifications for events that did not occur.

---

60. AUDIT LOG

Create an audit log for important actions.

Examples:

- Payment submitted
- Payment approved
- Payment rejected
- Tool activated
- Claim status changed
- Important administrative actions

Store:

- actor
- action
- target
- timestamp
- relevant metadata

---

61. NO FAKE SUCCESS

Never say:

"Payment successful"

when the system has only received a receipt.

Never say:

"Payment approved"

until an administrator has approved it.

Never say:

"Email sent"

unless the email system actually sent it.

Never say:

"Report generated"

unless it actually generated.

Never say:

"Upload complete"

until the actual upload completes.

---

62. NO DEAD BUTTONS

Every important button must perform a real action.

Examples:

- Subscribe
- Upload Receipt
- Submit
- Approve
- Reject
- Open
- Add Job
- Add Invoice
- Add Subscription
- Add Expense
- Add Claim
- Generate Report
- Export
- Save
- Delete
- Edit

If a feature is not yet configured, clearly communicate its state rather than pretending it works.

---

63. DUPLICATE PAYMENT PROTECTION

Prevent accidental duplicate payment submissions.

If a user already has a pending payment for a tool:

show the existing pending submission where appropriate.

Backend logic must also prevent invalid duplicates.

---

64. APPROVAL IDEMPOTENCY

If an admin clicks Approve twice:

Do not create:

- duplicate entitlements
- duplicate subscriptions
- duplicate activation records

The second request should recognize that the payment has already been approved.

---

65. BILLING CONSISTENCY

Payment status and entitlement status must remain consistent.

Example:

Payment:
approved

Entitlement:
active

Avoid:

Payment:
approved

Entitlement:
locked

unless a clearly handled backend processing state exists.

Use transactional/backend logic where appropriate.

---

66. PERFORMANCE

Optimize:

- Database queries
- Storage uploads
- Image processing
- React rendering
- Real-time subscriptions

Use pagination for large lists.

Do not load all records unnecessarily.

---

67. MOBILE ADMIN

The administrator must be able to review payments from mobile.

Mobile admin must support:

- Search
- Filter
- View receipt
- Approve
- Reject

---

68. MOBILE USER

Users must easily be able to:

- Subscribe
- Upload receipt
- Check payment status
- Open tools
- Create records
- Upload documents
- View reports
- Manage their account

---

69. ACCOUNT SETTINGS

Create:

Profile

- Full name
- Email
- WhatsApp number

Security

- Password management
- Logout

Billing

- Payment history
- Active tools
- Pending tools
- Rejected submissions

Notifications

- Reminder preferences
- Notification preferences

---

70. ACCESSIBILITY

Use:

- Semantic HTML
- Accessible buttons
- Form labels
- Keyboard navigation
- Focus states
- Accessible modals
- Good contrast
- Meaningful image descriptions

---

71. TESTING

Before considering the application complete, test the actual product.

New User Test

Create an account.

Confirm:

- Authentication works
- Dashboard loads
- Five tools appear
- All are locked
- No fake data appears

Payment Test

Submit a real test receipt.

Confirm:

- File validation
- Compression
- Upload
- Database record
- Tracking code
- Pending status

Admin Test

Log in as administrator.

Confirm:

- Real payment appears
- Receipt opens
- Approve works
- Reject works
- Audit event exists

Unlock Test

Approve a payment.

Confirm:

- User status updates
- Tool becomes unlocked
- Open button works

Empty Tool Test

Open newly activated tool.

Confirm:

- All counts are zero
- Lists are empty
- Empty state appears
- No fake charts exist

Real Data Test

Create one real record.

Confirm:

- Record appears
- Count changes from 0 to 1
- Analytics update
- Database contains the record

Delete the record.

Confirm:

- Count returns to 0
- Record disappears
- Analytics update correctly

---

72. SECURITY TESTING

Test that a normal user cannot:

- Access another user's records
- Access another user's receipts
- Approve payments
- Reject payments
- Activate tools
- Change their payment to approved
- Access admin dashboard
- Modify another user's data

Test that an unauthorized user cannot access administrative functionality even if they know the admin URL or query parameter.

---

73. IMPORTANT LOVABLE BUILD RULE

Build this in a way that Lovable can maintain and extend.

Use:

- Reusable components
- Reusable form components
- Reusable cards
- Reusable status badges
- Centralized pricing configuration
- Centralized tool definitions
- Clean routing
- Clear database access layer
- Secure backend functions
- Clear TypeScript types
- Proper error handling

Do not create one giant component containing the entire application.

---

74. PRODUCT STRUCTURE

Use a shared application shell.

Example:

Eminent Clicks
│
├── Dashboard
│
├── SubTrack
│
├── JobFlow
│
├── PayChaser
│
├── ReportSnap
│
├── ClaimDesk
│
├── Billing
│
├── Notifications
│
├── Settings
│
└── Admin

---

75. TOOL ACTIVATION FLOW

The complete activation flow must be:

LOCKED
   ↓
Subscribe
   ↓
Payment Modal
   ↓
Bank Transfer
   ↓
Upload Receipt
   ↓
Real Storage Upload
   ↓
Real Payment Record
   ↓
Tracking Code
   ↓
PENDING
   ↓
Admin Reviews
   ↓
APPROVED
   ↓
Entitlement Activated
   ↓
UNLOCKED
   ↓
Open Tool

Rejected flow:

PENDING
   ↓
ADMIN REJECTS
   ↓
REJECTED
   ↓
User sees reason
   ↓
Resubmit

---

76. USER EXPERIENCE PRINCIPLE

At every point, the user must understand what is happening.

For example:

After selecting a tool

"You're subscribing to JobFlow for ₦10,000."

After receipt upload

"Your receipt has been submitted and is awaiting verification."

While pending

"An administrator is reviewing your payment."

After approval

"Your JobFlow access is now active."

After rejection

"Your payment submission was not approved."

Then show the actual reason where provided.

---

77. NO FAKE ANALYTICS

If a tool has no records:

Do not show a beautiful fake graph.

Show:

No data available yet.

Then explain how to create the first record.

Example:

Create your first sale to start seeing financial analytics.

---

78. NO FAKE ADMIN ANALYTICS

If no payments have been submitted:

All admin counters are zero.

Do not create fake revenue.

Do not create fake customer counts.

Do not create fake payment charts.

---

79. NO FAKE NOTIFICATIONS

If there are no notifications:

Show:

You're all caught up.

Do not generate sample notifications.

---

80. NO FAKE PAYMENT HISTORY

A new account must have:

No payment history yet.

Do not display sample payments.

---

81. NO FAKE BUSINESS RECORDS

A newly activated tool must start completely empty.

Example JobFlow:

Jobs: 0
Quotes: 0
Scheduled: 0
In Progress: 0
Completed: 0
Invoiced: 0

Example PayChaser:

Invoices: 0
Outstanding: ₦0
Overdue: ₦0
Paid: ₦0

Example SubTrack:

Subscriptions: 0
Monthly: ₦0
Annual: ₦0

Example ReportSnap:

Sales: ₦0
Expenses: ₦0
Profit: ₦0

Example ClaimDesk:

Claims: 0
Claimed: ₦0
Paid: ₦0

---

82. IMPORTANT: DO NOT OVERBUILD UNNECESSARILY

Build the requested functionality properly.

Do not add random features simply to make the application appear larger.

Every feature should have a real business purpose.

Prioritize:

1. Reliability
2. Data integrity
3. Security
4. User experience
5. Maintainability
6. Performance
7. Visual polish

---

83. FINAL ACCEPTANCE STANDARD

The application is NOT complete merely because the pages look beautiful.

It is complete only when:

- Authentication works
- Lovable Cloud backend works
- Database works
- File storage works
- Payment submissions work
- Receipt uploads work
- Tracking codes work
- Admin authentication works
- Admin approval works
- Admin rejection works
- Tool entitlements work
- Real-time status updates work where supported
- User data isolation works
- All five modules work
- Empty states work
- Search works
- Filtering works
- Forms validate
- Loading states work
- Error states work
- Mobile layouts work
- No fake production data exists
- No fake dashboard statistics exist
- No fake payment records exist
- No fake admin records exist
- No fake charts exist
- No fake notifications exist
- No dead primary buttons exist

---

84. FINAL PRODUCT EXPERIENCE

The customer experience must be:

Discover Eminent Clicks

↓

Create account

↓

See five locked tools

↓

Choose a tool

↓

See exact price

↓

Make bank transfer

↓

Upload real receipt

↓

Receipt is actually stored

↓

Payment submission is actually recorded

↓

Tracking code is generated

↓

Status becomes Pending

↓

Administrator reviews actual receipt

↓

Administrator approves or rejects

↓

If approved:

Tool becomes Unlocked

↓

User opens the actual tool

↓

Tool starts completely empty

↓

User creates real business records

↓

Dashboard calculates real information from those records

---

85. FINAL DEVELOPMENT COMMAND

Now build Eminent Clicks as a complete, production-ready application using Lovable Cloud only.

Do not use Firebase.

Do not introduce another backend unless absolutely required by Lovable Cloud's architecture.

Do not replace backend functionality with mock data.

Do not fabricate any user activity.

Do not fabricate payment records.

Do not fabricate analytics.

Do not fabricate admin activity.

Do not fake successful operations.

Do not unlock tools without verified approval.

Do not trust the frontend with authorization.

Do not expose private files.

Do not create dead buttons.

Do not create placeholder dashboards pretending to be functional.

Build the real product.

The central rule is:

"IF IT DID NOT ACTUALLY HAPPEN, EMINENT CLICKS MUST NOT SAY THAT IT HAPPENED."

Use Lovable Cloud as the single source of truth and build the application so that it can be genuinely used by real customers.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://eminent-clicks-suite.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/79b41579-7d72-485d-8bb3-a5d696d71682).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
