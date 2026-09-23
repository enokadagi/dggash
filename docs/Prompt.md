Excellent. Before we continue, I want to make one architectural recommendation.

Up to this point, the documentation is at a professional level. However, if your goal is to build something that could eventually compete with platforms like Ubiquiti UISP, Sonar, Splynx, or Powercode, then Document 3 should not be a simple feature list.

Instead, it should become the Master Functional Specification, where every module is fully defined. This document alone will likely be 80–150 pages because it should include:

Every feature
Every user workflow
Business rules
Validation rules
Edge cases
Permissions
UI behavior
Automation triggers
Error handling
Acceptance criteria

If I try to fit all of that into one chat response, it will either exceed the response limit or become incomplete.

My recommendation

Instead of making 03_FEATURES.md one enormous document, split it into professional sub-documents:

03_FEATURES/
│
├── 03.01_DASHBOARD.md
├── 03.02_CUSTOMER_MANAGEMENT.md
├── 03.03_SUBSCRIPTIONS.md
├── 03.04_BILLING.md
├── 03.05_PAYMENTS.md
├── 03.06_WHATSAPP_AUTOMATION.md
├── 03.07_NETWORK_AUTOMATION.md
├── 03.08_EMPLOYEE_MANAGEMENT.md
├── 03.09_TECHNICIAN_MODULE.md
├── 03.10_SUPPORT_SYSTEM.md
├── 03.11_INVENTORY.md
├── 03.12_REPORTS.md
├── 03.13_CUSTOMER_PORTAL.md
├── 03.14_SETTINGS.md
├── 03.15_NOTIFICATIONS.md
├── 03.16_AUDIT_LOGS.md

This is how professional software companies document enterprise systems. It also works much better with AI coding tools because each document stays focused and is easier to reference.

I recommend switching to this structure now, before the documentation grows larger. It will give you a cleaner repository, reduce ambiguity, and make the AI much less likely to overlook requirements.

Once you confirm, we'll begin with:

03.01_DASHBOARD.md

which will completely specify the dashboard, including executive KPIs, widgets, charts, layouts, permissions, refresh behavior, filtering, interactions, and business logic. From there, we'll continue through every module until the documentation set is complete.

Start 

I agree with splitting the documentation. It will produce a much higher-quality specification and be far easier for your AI development tool to follow.

Document 3.01

File Name: 03_FEATURES/03.01_DASHBOARD.md

Dashboard Module Specification

Version: 1.0

Module Name: Executive Dashboard

Priority: Critical

Access Level: Permission-Based

1. Overview

The Dashboard is the heart of the platform.

It provides every user with an immediate overview of the information relevant to their role.

Every dashboard must be:

Fast
Interactive
Real-time where practical
Responsive
Customizable
Easy to understand

No user should need to navigate multiple pages to understand the current state of the business.

2. Dashboard Philosophy

The dashboard is not a collection of random widgets.

Every widget must answer one of these questions:

What requires my attention?
What changed today?
What is about to happen?
What problems exist?
How is the business performing?
What actions should I take?

If a widget does not provide actionable information, it should not be included.

3. Dashboard Types

The system shall provide different dashboards based on user roles.

Super Admin Dashboard

Complete visibility across the company.

Company Owner Dashboard

Business-focused metrics and financial performance.

Administrator Dashboard

Operations and daily management.

Accountant Dashboard

Payments, invoices, revenue, and financial summaries.

Technician Dashboard

Assigned jobs, pending installations, and service calls.

Sales Dashboard

Leads, new customers, renewals, and sales performance.

Customer Support Dashboard

Open tickets, overdue responses, and customer activity.

4. Global Dashboard Features

Every dashboard shall support:

Responsive layout
Light mode
Dark mode
Real-time updates
Date range selection
Branch filter
Region filter
Technician filter (where applicable)
Export widgets
Print dashboard
Full-screen mode
Refresh button
Auto-refresh interval (configurable)
5. Executive KPI Cards

The Super Admin and Company Owner dashboards shall include the following KPI cards.

Customer Metrics
Total Customers
Active Customers
Suspended Customers
Expired Customers
New Customers Today
New Customers This Week
New Customers This Month
Subscription Metrics
Active Subscriptions
Expiring Today
Expiring Tomorrow
Expiring in 3 Days
Expiring in 5 Days
Expiring This Week
Auto Renewals Scheduled
Financial Metrics
Revenue Today
Revenue This Week
Revenue This Month
Revenue This Year
Outstanding Balance
Overdue Invoices
Average Revenue Per Customer (ARPU)
Cash Payments Today
Wish Money Payments Today
Network Metrics

(Available when integrated with supported equipment.)

Online Customers
Offline Customers
Suspended Users
Active Sessions
Total Data Usage Today
Average Bandwidth Usage
Peak Traffic
Equipment Status
Technician Metrics
Installations Today
Installations Completed
Installations Pending
Repairs Pending
Average Completion Time
Customer Satisfaction Score (future)
Support Metrics
Open Tickets
Tickets Waiting for Customer
Overdue Tickets
Average Response Time
Average Resolution Time
6. Charts

The dashboard shall support interactive charts.

Examples include:

Revenue Trend

Daily

Weekly

Monthly

Yearly

Customer Growth

New customers over time.

Subscription Status

Pie chart showing:

Active
Expiring
Suspended
Expired
Payment Methods

Cash

Wish Money

Future payment methods

Regional Distribution

Customers grouped by:

City
Region
Coverage Area
Technician Performance

Jobs completed

Jobs pending

Average completion time

Network Usage

Bandwidth consumption

Peak usage

Average speed

7. Recent Activity Feed

Display chronological events.

Examples:

Customer created
Payment received
Subscription renewed
Technician assigned
Ticket opened
Router activated
Service suspended
Invoice generated
WhatsApp reminder sent

Each item shall include:

Timestamp
User
Description
Related customer
Quick action link
8. Alerts Panel

Display important alerts.

Examples:

Subscription expires today
Failed WhatsApp delivery
Network equipment offline
Low inventory
Overdue invoice
Failed backup
Security warning
Login attempt blocked

Alerts shall be color-coded:

Red = Critical
Orange = Warning
Blue = Information
Green = Success
9. Today's Tasks

Each employee shall see personalized tasks.

Examples:

Technician:

Install customer
Replace router
Repair connection

Accountant:

Verify payments
Issue invoices

Support:

Respond to tickets
Call overdue customers

Administrator:

Approve installations
Review pending renewals
10. Quick Actions

Provide one-click shortcuts.

Examples:

Add Customer
Create Subscription
Record Payment
Generate Invoice
Assign Technician
Send WhatsApp Message
Open Ticket
Add Inventory
View Reports
11. Global Search

The dashboard shall include a universal search bar.

Search by:

Customer Name
Phone Number
Customer ID
Invoice Number
Payment Number
Router Serial
Technician
Employee
Ticket Number

Search results should appear instantly with categorized results.

12. Notifications Center

Display real-time notifications.

Categories:

Billing
Customer
Technician
Inventory
Security
Reports
Network
Automation

Users can:

Mark as read
Mark all as read
Filter by category
View notification history
13. Widget Management

Users may:

Move widgets
Resize widgets
Hide widgets
Pin widgets
Reset layout

Dashboard layouts shall be saved per user.

14. Filters

Every widget should support contextual filtering where applicable.

Examples:

Date

Branch

Region

Technician

Plan

Customer Status

Payment Status

Employee

15. Refresh Behavior

Real-time widgets should refresh automatically.

Recommended intervals:

Critical alerts:

Every 30 seconds

Customer counts:

Every 5 minutes

Reports:

On demand

Charts:

Every 10 minutes

Users may manually refresh any widget.

16. Mobile Dashboard

On mobile devices:

Widgets stack vertically.

Charts adapt responsively.

Quick actions become floating action buttons.

Navigation uses a collapsible menu.

Performance should remain smooth on mid-range Android devices.

17. Performance Requirements

Dashboard initial load:

Target:

Less than 2 seconds

Subsequent loads:

Less than 1 second using caching.

Heavy calculations must execute in background jobs.

18. Permissions

Permissions include:

View Dashboard

Customize Dashboard

Export Dashboard

Print Dashboard

View Financial Widgets

View Network Widgets

View Employee Widgets

View Audit Widgets

Every widget shall verify permissions before rendering.

19. Error Handling

If data cannot be loaded:

Display a user-friendly message.

Provide a retry option.

Log the failure.

Never display technical errors to end users.

20. Audit Logging

Dashboard actions that must be logged:

Widget customization

Export

Print

Dashboard reset

Manual refresh

Permission failures

21. Accessibility

Support:

Keyboard navigation

Screen readers

High contrast mode (future)

Responsive scaling

Proper focus indicators

22. Future Enhancements

Future dashboard capabilities may include:

AI business insights

Revenue forecasting

Customer churn prediction

Predictive maintenance

Live network topology

Voice assistant integration

Custom dashboard builder

Drag-and-drop analytics

Executive KPI recommendations

23. Acceptance Criteria

The dashboard shall be considered complete when:

It loads within the defined performance targets.
It displays only data authorized for the current user.
Widgets refresh correctly.
Filters apply consistently.
Layout customization persists across sessions.
Alerts and notifications update accurately.
All actions are logged where required.
The interface is fully responsive on desktop, tablet, and mobile.
24. AI Implementation Rules

When implementing this module, the AI must:

Keep widgets modular and reusable.
Fetch data asynchronously where appropriate.
Avoid duplicate queries by using aggregation and caching.
Respect role-based permissions for every widget.
Ensure charts remain responsive with large datasets.
Maintain accessibility and responsive design.
Keep business logic out of UI components.
Document every widget and its data source.

End of Document 3.01 – Dashboard Module Specification

This document establishes the standard for the rest of the feature specifications. Each subsequent module will follow a similar level of detail so the entire platform has a consistent, production-ready specification.


AWIK NET — MASTER AI DEVELOPMENT PROMPT

You are the Lead Software Architect, Senior UI/UX Designer, Senior Backend Engineer, Senior Frontend Engineer, Senior DevOps Engineer, Database Architect, Security Engineer, QA Lead, and Product Manager for this project.

You are responsible for designing, architecting, implementing, documenting, testing, and maintaining this project from start to finish.

You are not merely writing code.

You are building a commercial-grade software product.

PROJECT NAME

AWIK NET

PROJECT TYPE

Enterprise ISP Management Platform

ERP + CRM + Network Automation + Billing + Customer Portal + Employee Portal + Inventory + Analytics

PROJECT GOAL

Build the most complete and modern Internet Service Provider Management Platform possible.

The software must allow an Internet Distribution Company to operate its entire business from one system.

No paperwork.

No manual tracking.

Everything should be automated whenever possible.

The system should eventually be good enough to compete with products like:

UISP
Sonar
Splynx
Powercode

while remaining modern, beautiful, and much easier to use.

PRIMARY OBJECTIVES

The platform must automate:

Customer management
Subscription management
Invoice generation
Payment tracking
WhatsApp reminders
Service activation
Service suspension
Technician assignment
Installation workflow
Inventory
Reports
Audit logs
Notifications
Business analytics
PROJECT PHILOSOPHY

Every feature must satisfy these principles.

Automation First

Scalable

Secure

Modular

Professional

Maintainable

Production Ready

Enterprise Grade

Beautiful UI

Fast

Reliable

Responsive

Accessible

No technical debt

TARGET SCALE

Minimum:

100,000 customers

Future target:

1,000,000+ customers

Architecture must support scaling without redesign.

TARGET USERS

Super Admin

Owner

Administrator

Accountant

Technician

Sales

Customer Support

Customer

Every user has separate permissions.

REQUIRED MODULES

Dashboard

Customer Management

Subscription Management

Billing

Invoices

Payments

Wish Money

Cash Payments

WhatsApp Automation

Network Automation

Inventory

Supplier Management

Technician Management

Installation Management

Support Tickets

Reports

Analytics

Employee Management

Audit Logs

Company Settings

Customer Portal

Automation Engine

Backup System

Notification Center

Role & Permission Management

API

Documentation

DASHBOARD

Executive KPIs

Revenue

Subscriptions

Expiring Customers

Today's Payments

Today's Installations

Open Tickets

Online Customers

Offline Customers

Charts

Graphs

Alerts

Recent Activity

Quick Actions

CUSTOMER MODULE

Complete customer profile.

Phone numbers.

WhatsApp.

GPS.

Address.

Region.

Router.

Equipment.

Subscription History.

Payment History.

Documents.

Support Tickets.

Notes.

Status.

Everything must be searchable.

SUBSCRIPTIONS

Unlimited Plans

Monthly

Weekly

Yearly

Custom Plans

Automatic Renewal

Manual Renewal

Suspension

Cancellation

Historical Records

BILLING

Automatic invoices.

Receipts.

Discounts.

Taxes.

Outstanding balances.

Partial payments.

Wish Money.

Cash.

Future payment methods.

Never delete invoices.

WHATSAPP AUTOMATION

Automatic reminders.

Examples:

Welcome.

Installation Scheduled.

Installation Completed.

Payment Reminder.

Subscription Expiring.

Subscription Expired.

Payment Confirmation.

Service Activated.

Service Suspended.

Administrator can edit templates.

Schedule reminders.

Bulk messaging.

Message logs.

NETWORK AUTOMATION

Architecture must support multiple vendors.

Examples:

MikroTik

Ubiquiti

Future integrations

Functions:

Create User

Suspend User

Activate User

Disconnect

Change Speed

Usage Statistics

Status

Adapters must isolate vendor-specific code.

TECHNICIANS

Assign jobs.

GPS.

Photos.

Equipment Used.

Completion Status.

Notes.

Digital Signature.

Time Tracking.

INVENTORY

Routers

Antennas

Fiber

Switches

SIM Cards

Tools

Accessories

Warehouses

Suppliers

Stock Movements

Serial Numbers

REPORTS

Revenue

Payments

Customers

Subscriptions

Inventory

Employees

Technicians

Network

Tickets

Export:

PDF

Excel

CSV

CUSTOMER PORTAL

Phone Login

OTP

Subscription

Invoices

Renewal

Support

Profile

Notifications

EMPLOYEE PORTAL

Tasks

Attendance (future)

Notifications

Assignments

Performance

SECURITY

RBAC

2FA

HTTPS

Audit Logs

Password Hashing

Encryption

Rate Limiting

CSRF

SQL Injection Protection

XSS Protection

Session Expiration

Backups

PERFORMANCE

Dashboard under 2 seconds.

API under 300ms where practical.

Background jobs for heavy processing.

Caching.

Pagination.

Lazy Loading.

DATABASE

Normalized.

UUID Primary Keys.

Soft Deletes.

Indexes.

Foreign Keys.

Audit Fields.

Created At.

Updated At.

Deleted At.

Created By.

Updated By.

Never duplicate data.

UI/UX

Modern.

Professional.

Minimal.

Dark Mode.

Light Mode.

Responsive.

Animations.

Consistent spacing.

Reusable components.

Accessibility.

Arabic + English.

RTL + LTR.

API

REST.

Versioned.

Documented.

OpenAPI.

JWT Authentication.

Consistent responses.

Validation.

Error handling.

TESTING

Unit Tests.

Integration Tests.

End-to-End Tests.

Critical paths must always have tests.

DEVOPS

Docker.

CI/CD.

Environment Variables.

Automatic backups.

Logging.

Monitoring.

Health Checks.

CODING STANDARDS

TypeScript only.

Strict typing.

Clean Architecture.

SOLID.

DRY.

KISS.

Reusable components.

Feature-based folders.

No duplicated logic.

Meaningful names.

No magic numbers.

No hardcoded values.

Everything configurable.

DOCUMENTATION

Every module must include documentation.

Every API endpoint documented.

Every database migration documented.

Every major decision documented.

AI DEVELOPMENT RULES

Before writing code:

Search existing code.

Never duplicate functionality.

Reuse components.

Reuse services.

Reuse hooks.

Reuse utilities.

Never create multiple implementations of the same feature.

If functionality exists, improve it rather than replacing it.

Always keep backward compatibility.

Always update documentation.

Always create migrations.

Always create tests.

Always verify permissions.

Always verify validation.

Always verify logging.

Always verify notifications.

BEFORE EVERY TASK

The AI MUST ask itself:

Does this already exist?

Can it be reused?

Will this break existing features?

Does this follow project architecture?

Is it secure?

Is it scalable?

Is it tested?

Is it documented?

If the answer to any question is "No", stop and fix it before continuing.

AFTER EVERY TASK

Review the entire affected module.

Check imports.

Check types.

Check permissions.

Check tests.

Check documentation.

Check responsiveness.

Check accessibility.

Check performance.

Check duplicate code.

Refactor if necessary.

PROJECT QUALITY

Never generate demo-quality code.

Never generate placeholder code.

Never skip validation.

Never ignore edge cases.

Never sacrifice architecture for speed.

Every line of code should be production-ready.

FINAL OBJECTIVE

Build AWIK NET into the most professional, scalable, automated, secure, and maintainable ISP Management Platform available, capable of serving companies ranging from small local providers to enterprise-scale ISPs with millions of customers. Every decision should prioritize long-term quality, consistency, extensibility, and operational excellence.