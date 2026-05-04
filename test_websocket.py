import asyncio
import json
import requests
import websockets
import sys
import os

# ─────────────────────────────────────────────────────────────────────────────
# Prerequisites:
# pip install requests websockets
#
# Usage:
# Run normally, or provide test credentials via environment variables:
# set TEST_EMAIL=admin@example.com
# set TEST_PASSWORD=YourPassword!
# set TEST_BUS_ID=some_bus_object_id
# python test_websocket.py
# ─────────────────────────────────────────────────────────────────────────────

BASE_URL = "https://busnirikshanapi.mauliksharma.org"
WS_URL = "wss://busnirikshanapi.mauliksharma.org/api/locations/livewebsocket"

EMAIL = "dragonsoul69420@gmail.com"
PASSWORD = "Test123@"
BUS_ID = os.environ.get("TEST_BUS_ID", "dummy_bus_id_1")

def get_token():
    print(f"Logging in as {EMAIL}...")
    try:
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": EMAIL,
            "password": PASSWORD
        })
        print(response.text, response.status_code)
        if response.status_code != 200:
            print(f"Failed to login. Status {response.status_code}: {response.text}")
            print("Please ensure your server is running and the credentials are valid.")
            print("You can override credentials by setting TEST_EMAIL and TEST_PASSWORD env vars.")
            sys.exit(1)
            
        token = response.json().get("access_token")
        print("Login successful. Acquired access token.")
        return token
    except requests.exceptions.ConnectionError:
        print(f"Failed to connect to {BASE_URL}. Is the backend running?")
        sys.exit(1)

async def test_websocket(token):
    headers = {
        "Authorization": f"Bearer {token}"
    }
    
    print(f"Connecting to {WS_URL}...")
    try:
        # Pass headers so the authorise middleware accepts the connection
        async with websockets.connect(WS_URL, extra_headers=headers) as ws:
            print("Connected successfully!\n")
            
            # 1. Wait for connection welcome message
            welcome = await ws.recv()
            print(f"Server  → {welcome}")
            
            # 2. Subscribe to a bus
            sub_msg = {
                "type": "subscribe",
                "busIds": [BUS_ID]
            }
            print(f"\nClient  → {json.dumps(sub_msg)}")
            await ws.send(json.dumps(sub_msg))
            
            # 3. Wait for subscription ACK
            ack = await ws.recv()
            print(f"Server  → {ack}")
            
            print(f"\nListening for live location updates for bus '{BUS_ID}'... (Press Ctrl+C to stop)")
            
            # 4. Keep listening for live updates from Redis Pub/Sub
            while True:
                msg = await ws.recv()
                
                # Prettify the JSON output if possible
                try:
                    parsed = json.loads(msg)
                    pretty_msg = json.dumps(parsed, indent=2)
                    print(f"\nServer Push ↓\n{pretty_msg}")
                except json.JSONDecodeError:
                    print(f"\nServer Push ↓\n{msg}")
                
    except websockets.exceptions.InvalidStatusCode as e:
        print(f"WebSocket connection rejected: HTTP {e.status_code}")
    except websockets.exceptions.ConnectionClosedError as e:
        print(f"Connection closed unexpectedly: {e}")
    except Exception as e:
        print(f"WebSocket error: {e}")

if __name__ == "__main__":    
    token = get_token()
    try:
        asyncio.run(test_websocket(token))
    except KeyboardInterrupt:
        print("\nTest stopped by user.")
