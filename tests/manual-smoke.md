# Manual Smoke Test

Follow these steps on a local build (for example, by running `python -m http.server 8000` from the repo root and visiting `http://localhost:8000/`).

1. Open `/?prop=KAL&lang=es` in the hub. Confirm the Kalispell theme loads and the Orientation modal is presented on first visit.
2. Complete any two Orientation tasks, refresh the page, and ensure the completed tasks remain checked after reload.
3. Select the floating Safety button, start a 5-minute SafeWalk, confirm the countdown begins, then cancel the session.
4. Navigate to the Events page, RSVP to an event, download the calendar invite (ICS), and open the My Event QR code modal.
5. Visit the Resources playbooks, mark several steps complete, and toggle **Show to Manager** to display the large-text summary card.
