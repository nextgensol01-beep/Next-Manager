# Email delivery architecture update

Production now uses browser-coordinated bounded batch requests. The prior managed-queue implementation is superseded. See [browser delivery, safe resume and production isolation](email-browser-delivery.md).

The former Inngest notes and adapter are preserved only in ignored local-inngest/archive/. They are not installed or deployed with the application.
