# My Invoices

**Tag:** `<next-my-invoices>` · **Category:** Requires sign-in · **Database setup:** none

Lets a signed-in parishioner view their own invoices and line-item details — for example, tuition, event fees, or other charges billed through MinistryPlatform.

## Add it to a page

Needs [`<next-user-menu>`](user-menu.md) on the same page (or its shared layout):

```html
<next-user-menu mp-base-url="https://yourchurch.ministryplatform.net"></next-user-menu>
<next-my-invoices></next-my-invoices>
```

## Settings

| Attribute | What it does | Example |
|---|---|---|
| `page-heading` | The heading shown above the invoice list. Defaults to "My Invoices". | `page-heading="Tuition & Fees"` |
| `payment-processor-target-url` | Enables the **Pay Now** button. This is your MP eGiving (or other supported vendor) payment URL — find it in MinistryPlatform's own payment vendor configuration. Without this, Pay Now shows a "payment not configured" message instead of the checkout form. | `payment-processor-target-url="https://onrealm.org/YourTenant/pay"` |
| `back-to-invoices-url` | Where the classic checkout widget's own "back" link returns to — normally just this same page. | `back-to-invoices-url="/my-invoices"` |
| `checkout-custom-css` | A stylesheet URL applied inside the classic checkout widget, to better match your site's look. | `checkout-custom-css="https://your-mp.ministryplatform.net/css/form2.css"` |
| `customcss` | Override this widget's own colors — the invoice list and detail view, separate from the classic checkout popup above — see [Customizing Widget Colors](custom-styling.md). | `customcss="https://your-site.com/brand.css"` |

## How payment works

Clicking **Pay Now** doesn't process payment itself — it embeds MinistryPlatform's own classic checkout widget (`mpp-checkout`) for that one step, which then redirects to your payment vendor and back. This is deliberate: the vendor handoff is verified by MinistryPlatform's server via a signed token, not by anything the browser reports, so there's no safe way (or need) to reimplement it independently.

This means:
- Your site's classic MPWidgets script (the one referenced in [Getting Started](../README.md)) must actually be loaded on the page, and this domain must be in MinistryPlatform's Permitted URLs for classic widgets — the same requirement `<next-user-menu>` has for its own sign-in.
- A payment vendor must already be configured in MinistryPlatform (Payment Processor URL + the shared JWT signing key) before `payment-processor-target-url` will do anything useful.

## Notes

- If a signed-out visitor reaches this page, they'll see a prompt to sign in rather than an error.
- After returning from a payment attempt, the invoice is re-fetched from MinistryPlatform rather than trusting anything client-side — so the status shown always reflects what MinistryPlatform actually recorded.
