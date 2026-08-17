# Space Availability — Database Setup

No SQL scripts here — this widget reads and writes standard MinistryPlatform tables (`Rooms`, `Buildings`, `Events`, `Event_Rooms`) that already exist on every instance. What's actually needed is the same kind of **permission grant** described in the [Database/README.md](../README.md) "Why the permission step exists" section — `Buildings` and `Event_Rooms` are tables no earlier widget in this project ever needed, so they aren't covered by whatever access an earlier setup already granted.

## What to grant

In MinistryPlatform, go to **Administration → Security Roles**, open the role your widget API Client uses (`Administrators` unless you changed it — see [the root setup guide](../../README.md), Step 2), and confirm/add:

| Table | Access needed | Why |
|---|---|---|
| `Buildings` | Read | So the widget can list which buildings exist under a congregation. |
| `Rooms` | Read | So the widget can list which rooms exist under a building, and read each room's `Bookable` flag and capacity. |
| `Events` | Read, and **Edit** (Create) if `allow-requests` is turned on for any widget instance | Read is used to show existing reservations. Edit/Create is only needed to actually create the new Event record behind a submitted request. |
| `Event_Rooms` | Read, and **Edit** (Create) if `allow-requests` is turned on for any widget instance | This is MinistryPlatform's own Room Reservation record — read shows existing bookings; Edit/Create links a new request's Event to the requested Room. |

If you're never turning on `allow-requests` anywhere, **Read** on all four tables above is sufficient — skip the Edit/Create grants until you actually need them.

## Nothing else to configure

Everything else the widget needs — which congregations, buildings, and rooms exist, which rooms are bookable — comes from data you already maintain day to day in MinistryPlatform (the **Rooms**, **Buildings**, and **Locations** pages). There's no separate setup step beyond the permission grant above.
