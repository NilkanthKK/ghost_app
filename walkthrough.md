# Walkthrough: GhostVibe Protocol - Advanced Features

This document describes how to test contact deletion, clear chat logs, multi-select message deletion, profile pictures, and stories (status updates).

---

## 🚀 1. Running the Project

### A. Run the Backend API Server
Navigate to the `ghostvibe_backend` directory in a terminal and start the server:
```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8080
```

### B. Run the Frontend client
Navigate to the `ghostvibe_frontend` directory in a second terminal and start the client:
```powershell
npm.cmd run dev
```
Open `http://localhost:5173` in your browser.

---

## 🗣️ 2. Step-by-Step Verification Guide

To test, open two different browser sessions (e.g. Tab 1 in Chrome Normal Mode, Tab 2 in Chrome Incognito Mode or Edge).

### Step A: Log in as User A and User B
1. **User A**: Login on Tab 1 with phone number `9876543210` (OTP: `123456`).
2. **User B**: Login on Tab 2 with phone number `8765432109` (OTP: `123456`).

### Step B: Profile Pictures & Contact Addition
1. On User A's screen, click the **+** message icon.
2. Enter Contact Name: **Bhai**
3. Enter Phone Number: `8765432109`
4. Click **Add Secure Vibe**.
5. Observe the contact avatar: it renders as a **unique colorful gradient** specific to User B's phone number.
6. Verify that B's status on User A's screen switches to **Online** (indicated by a green presence dot).

### Step C: Test Real-Time E2EE Messaging (Fixed IPv4)
1. Type a message on User A's screen and send it to User B.
2. Confirm B receives it instantly, changing the tick to blue.
*(Directing all calls to IPv4 `127.0.0.1:8080` resolves the Windows localhost IPv6 blocking, allowing messages to flow instantly).*

### Step D: Test WhatsApp-Style Status (Stories)
1. In the **Status Tray** (horizontal scrollbar at the top of the sidebar), click the **My Status** circle (User A's avatar with the `+` overlay).
2. Select any status photo from your computer.
3. Once uploaded, User B will see a **green ring** appear around User A's avatar in their Status Tray.
4. On User B's screen, click User A's status circle:
   - The fullscreen Story Viewer will open.
   - The status image will display with its caption.
   - An animated progress bar at the top will run for 5 seconds and then close automatically.
5. In 24 hours, the status will automatically disappear from both local caches.

### Step E: Test Message Multi-Select Deletion
1. In the active chat window, click the **Select** button in the header.
2. Checkboxes will appear next to the message list.
3. Check multiple messages.
4. Click the **Delete Selected** button in the bottom floating actions bar.
5. Confirm the dialog: verify the selected messages are deleted (locally, or revoked for everyone if you sent them).

### Step F: Test Clear Chat
1. In the active chat window, click the **Clear Chat** button in the header.
2. Confirm the prompt.
3. Verify that all message logs for this contact disappear instantly.

### Step G: Test Contact Deletion (Sidebar)
1. In the sidebar list, hover over the contact you want to delete.
2. A **Trash** icon will appear on the right side of the contact card.
3. Click the Trash icon and confirm the prompt.
4. Verify the contact and their entire chat logs are deleted.
