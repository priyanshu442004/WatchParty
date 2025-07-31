#!/usr/bin/env python3
import socketio
import asyncio
import sys
import time
from datetime import datetime

class SocketIOTester:
    def __init__(self, server_url="https://e70d0026-f720-4080-93f1-c644fd5756ae.preview.emergentagent.com"):
        self.server_url = server_url
        self.sio = socketio.AsyncClient()
        self.connected = False
        self.room_joined = False
        self.test_results = []
        self.setup_event_handlers()

    def setup_event_handlers(self):
        @self.sio.event
        async def connect():
            print("✅ Socket.IO connection established")
            self.connected = True
            self.test_results.append(("Connection", True, "Successfully connected to server"))

        @self.sio.event
        async def disconnect():
            print("🔌 Socket.IO disconnected")
            self.connected = False

        @self.sio.event
        async def connected(data):
            print(f"📨 Received 'connected' event: {data}")
            self.test_results.append(("Connected Event", True, f"Received: {data}"))

        @self.sio.event
        async def room_joined(data):
            print(f"🏠 Room joined successfully: {data}")
            self.room_joined = True
            self.test_results.append(("Room Join", True, f"Joined room: {data.get('room_id')}"))

        @self.sio.event
        async def user_joined(data):
            print(f"👤 User joined room: {data}")
            self.test_results.append(("User Joined Event", True, f"User: {data.get('user_name')}"))

        @self.sio.event
        async def connect_error(data):
            print(f"❌ Connection error: {data}")
            self.test_results.append(("Connection", False, f"Error: {data}"))

    async def test_connection(self):
        """Test basic Socket.IO connection"""
        print("\n🔍 Testing Socket.IO Connection...")
        try:
            await self.sio.connect(self.server_url)
            await asyncio.sleep(2)  # Wait for connection to establish
            
            if self.connected:
                print("✅ Connection test passed")
                return True
            else:
                print("❌ Connection test failed")
                return False
        except Exception as e:
            print(f"❌ Connection failed: {str(e)}")
            self.test_results.append(("Connection", False, f"Exception: {str(e)}"))
            return False

    async def test_join_room(self, room_id="test-room-123", user_name="TestUser"):
        """Test joining a room via Socket.IO"""
        print(f"\n🔍 Testing Room Join (Room: {room_id}, User: {user_name})...")
        
        if not self.connected:
            print("❌ Cannot test room join - not connected")
            return False

        try:
            # Emit join_room event
            await self.sio.emit('join_room', {
                'room_id': room_id,
                'user_name': user_name
            })
            
            # Wait for response
            await asyncio.sleep(3)
            
            if self.room_joined:
                print("✅ Room join test passed")
                return True
            else:
                print("❌ Room join test failed - no room_joined event received")
                self.test_results.append(("Room Join", False, "No room_joined event received"))
                return False
                
        except Exception as e:
            print(f"❌ Room join failed: {str(e)}")
            self.test_results.append(("Room Join", False, f"Exception: {str(e)}"))
            return False

    async def test_webrtc_events(self):
        """Test WebRTC-related Socket.IO events"""
        print("\n🔍 Testing WebRTC Events...")
        
        if not self.connected:
            print("❌ Cannot test WebRTC events - not connected")
            return False

        try:
            # Test toggle_video event
            await self.sio.emit('toggle_video', {'enabled': False})
            await asyncio.sleep(1)
            
            # Test toggle_audio event  
            await self.sio.emit('toggle_audio', {'enabled': False})
            await asyncio.sleep(1)
            
            print("✅ WebRTC events sent successfully (no errors)")
            self.test_results.append(("WebRTC Events", True, "Events sent without errors"))
            return True
            
        except Exception as e:
            print(f"❌ WebRTC events failed: {str(e)}")
            self.test_results.append(("WebRTC Events", False, f"Exception: {str(e)}"))
            return False

    async def run_all_tests(self):
        """Run all Socket.IO tests"""
        print("🚀 Starting Socket.IO Tests")
        print("=" * 50)
        
        # Test connection
        connection_success = await self.test_connection()
        
        if connection_success:
            # Test room joining
            await self.test_join_room()
            
            # Test WebRTC events
            await self.test_webrtc_events()
        
        # Disconnect
        if self.connected:
            await self.sio.disconnect()
            
        # Print results
        self.print_results()

    def print_results(self):
        """Print test results summary"""
        print("\n" + "=" * 50)
        print("📊 Socket.IO Test Results")
        print("=" * 50)
        
        passed = 0
        total = len(self.test_results)
        
        for test_name, success, details in self.test_results:
            status = "✅ PASS" if success else "❌ FAIL"
            print(f"{status} {test_name}: {details}")
            if success:
                passed += 1
        
        print(f"\nSummary: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All Socket.IO tests passed!")
            return 0
        else:
            print(f"⚠️ {total - passed} test(s) failed")
            return 1

async def main():
    tester = SocketIOTester()
    result = await tester.run_all_tests()
    return result

if __name__ == "__main__":
    try:
        result = asyncio.run(main())
        sys.exit(result)
    except KeyboardInterrupt:
        print("\n🛑 Tests interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n💥 Unexpected error: {str(e)}")
        sys.exit(1)