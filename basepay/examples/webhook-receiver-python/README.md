# BasePay webhook receiver — Python / Flask

```bash
pip install -r requirements.txt

# development
WEBHOOK_SECRET=whsec_your_merchant_secret python app.py

# production
WEBHOOK_SECRET=whsec_your_merchant_secret gunicorn --bind 0.0.0.0:4001 app:app
```

| Variable | Default | |
| --- | --- | --- |
| `WEBHOOK_SECRET` | — | **Required.** Refuses to start without it. |
| `PORT` | `4001` | Development server only; gunicorn takes `--bind`. |
| `WEBHOOK_PATH` | `/hooks/basepay` | |

Replace `mark_order_paid` and `flag_underpayment` with your own logic.

Note the `_processed` set is per-process, so under gunicorn with several workers
it does not dedupe at all. Replace it with a table before production — see
[../README.md](../README.md).

See [../README.md](../README.md) for the reasoning behind each part.
