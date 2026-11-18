# EngageBot API

REST API for the EngageBot project. It serves the admin web app, the teacher mobile app and the classroom droids.

## Setup

1. Install Node.js 20 or newer, then run `npm install`.
2. Copy `.env.example` to `.env` and fill it in. Get the real values privately from a teammate. Never commit `.env`.
3. Make sure your IP address is allowed under **Network Access** in MongoDB Atlas, on both clusters.
4. First time only: run `npm run create-admin` and `npm run create-emotion-indexes`.
5. Run `npm run dev`, then open <http://localhost:5000/api/health>.

The web app's address must be listed in `ALLOWED_ORIGINS`.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API and restarts on file changes |
| `npm start` | Starts the API |
| `npm test` | Runs the API tests on a throwaway in-memory database. Never touches Atlas. |
| `npm run create-admin` | Creates the first admin from `.env` |
| `npm run create-emotion-indexes` | Creates the unique `segment_id` indexes in the research database |

**If the server hangs on start or can't reach the database:** the network may be blocking the DNS server. Set `DNS_SERVERS` in `.env` (see `.env.example`), or try another network.

## Databases

| Connection | Database | Holds |
|---|---|---|
| `MONGO_URI` | App database | Teachers, students, classes, schedules, droids, session reports, audit log |
| `EMOTION_MONGO_URI` | `EngageBot_Emotion` on Zhang's cluster | Droid research data, in the same format as Zhang's `Emotion_Data` |

The research database holds no names or IC numbers. A student appears only as an anonymous `person_id`, and the link to the real student exists only in the app database (`Student.personId`). No images, video or audio are stored anywhere.

Do not modify `EngageBot_Emotion.emotion_records`. It is not used by this API.

## Access rules

| Who | How they authenticate | What they can reach |
|---|---|---|
| Admin | `Authorization: Bearer <token>` | Everything |
| Teacher | `Authorization: Bearer <token>` | Only their `assignedClasses`, and never IC numbers. They can correct student names, change their own password and check in to their own sessions. |
| Droid | `X-Droid-Key: <DROID_API_KEY>` | Uploads, heartbeat, session reports, check-in and anonymous IDs. No names or IC numbers. |

## Droid flow

1. **Heartbeat** every minute or so: `POST /api/droids/DRD-001/heartbeat` with `{ "battery": 80 }`. A droid silent for 5 minutes shows as offline.
2. **Get the class's anonymous IDs:** `GET /api/students/person-ids?classGroup=5A`.
3. **Teacher check-in:** `POST /api/schedules/:id/check-in`.
4. **Create the session report:** `POST /api/reports`. Its `id` is the `session_id` for every segment below, which is how a session is tied to its class.
5. **Every 30 seconds, send each student's segment:** `POST /api/emotion/segments`.
6. **At the end:** `POST /api/emotion/sessions/:sessionId/summarize` with `{ "complete": true }` writes the results into the session report.

Segment upload body. Everything except `segment` is optional, and one request is saved all-or-nothing:

```json
{
  "segment": {
    "segment_id": "seg_ab12cd34",
    "session_id": "<SessionReport id>",
    "person_id": "<UUID from step 2, or a new UUID for an unmatched person>",
    "scene_type": "classroom",
    "session_start_time": "2026-11-06T00:30:00.000Z",
    "start_offset_sec": 0,
    "end_offset_sec": 30,
    "_source_video": "DRD-001"
  },
  "modalities": {},
  "openface": {},
  "pose": {},
  "landmarks": {},
  "prediction": {}
}
```

Classroom noise is a separate segment with `"person_id": "classroom"` and a `voice` block holding `energy_mean` and `energy_std`.

Sending the same `segment_id` again returns `409`, so a droid can safely retry after a network failure. Unknown fields return `400`.

## Other endpoints

- `POST /api/auth/change-password`: change your own password
- `POST /api/teachers/:id/reset-password`: admin sets a new temporary password
- `DELETE /api/students/:id`, `DELETE /api/droids/:id`: admin only
- `GET /api/emotion/sessions/:sessionId`: a session's segments, predictions and noise
- `PATCH /api/emotion/predictions/:segmentId/label`: teacher corrects a prediction
- `GET /api/emotion/storage`: research database size against the free-tier limit (admin)
- `GET /api/audit-logs`: audit trail (admin)
