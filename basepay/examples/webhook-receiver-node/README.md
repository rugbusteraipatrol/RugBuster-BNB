# BasePay webhook receiver — Node

Zero dependencies. Node 20 or newer.

```bash
WEBHOOK_SECRET=whsec_your_merchant_secret PORT=4001 node server.mjs
```

| Variable | Default | |
| --- | --- | --- |
| `WEBHOOK_SECRET` | — | **Required.** Refuses to start without it. |
| `PORT` | `4001` | |
| `WEBHOOK_PATH` | `/hooks/basepay` | |

Replace `markOrderPaid` and `flagUnderpayment` with your own logic, and swap the
in-memory `processed` set for a durable store before production.

See [../README.md](../README.md) for the reasoning behind each part.
