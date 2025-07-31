import requests
import sys
import json
from datetime import datetime
import time

class WatchTogetherAPITester:
    def __init__(self, base_url="https://e70d0026-f720-4080-93f1-c644fd5756ae.preview.emergentagent.com"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_rooms = []

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)}")
                    return True, response_data
                except:
                    return True, response.text
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error Response: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"   Error Response: {response.text}")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False, {}
        except requests.exceptions.ConnectionError:
            print(f"❌ Failed - Connection error")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_root(self):
        """Test API root endpoint"""
        success, response = self.run_test(
            "API Root",
            "GET",
            "api/",
            200
        )
        return success

    def test_create_room(self, room_name):
        """Test room creation"""
        success, response = self.run_test(
            "Create Room",
            "POST",
            "api/rooms",
            200,
            data={"name": room_name}
        )
        if success and 'id' in response:
            self.created_rooms.append(response['id'])
            return response['id']
        return None

    def test_get_rooms(self):
        """Test getting all rooms"""
        success, response = self.run_test(
            "Get All Rooms",
            "GET",
            "api/rooms",
            200
        )
        return success, response

    def test_get_room_details(self, room_id):
        """Test getting specific room details"""
        success, response = self.run_test(
            "Get Room Details",
            "GET",
            f"api/rooms/{room_id}",
            200
        )
        return success, response

    def test_get_nonexistent_room(self):
        """Test getting non-existent room"""
        fake_room_id = "nonexistent-room-id-12345"
        success, response = self.run_test(
            "Get Non-existent Room",
            "GET",
            f"api/rooms/{fake_room_id}",
            200  # Backend returns 200 with error message
        )
        return success, response

    def test_invalid_room_creation(self):
        """Test creating room with invalid data"""
        success, response = self.run_test(
            "Create Room with Invalid Data",
            "POST",
            "api/rooms",
            422,  # Validation error
            data={}  # Missing required 'name' field
        )
        return success

def main():
    print("🚀 Starting WatchTogether API Tests")
    print("=" * 50)
    
    # Setup
    tester = WatchTogetherAPITester()
    test_room_name = f"Test Room {datetime.now().strftime('%H:%M:%S')}"

    # Test API Root
    print("\n📋 Testing Basic API Endpoints")
    tester.test_api_root()

    # Test Room Creation
    print("\n🏠 Testing Room Management")
    room_id = tester.test_create_room(test_room_name)
    
    if room_id:
        print(f"   Created room ID: {room_id}")
        
        # Test getting all rooms
        success, rooms = tester.test_get_rooms()
        if success:
            print(f"   Found {len(rooms)} total rooms")
        
        # Test getting specific room details
        success, room_details = tester.test_get_room_details(room_id)
        if success:
            print(f"   Room details retrieved successfully")
    else:
        print("   ❌ Room creation failed, skipping dependent tests")

    # Test edge cases
    print("\n🔍 Testing Edge Cases")
    tester.test_get_nonexistent_room()
    tester.test_invalid_room_creation()

    # Test another room creation to verify multiple rooms
    print("\n🏠 Testing Multiple Room Creation")
    room_id_2 = tester.test_create_room(f"Second Test Room {datetime.now().strftime('%H:%M:%S')}")
    if room_id_2:
        print(f"   Created second room ID: {room_id_2}")

    # Final summary
    print("\n" + "=" * 50)
    print(f"📊 Test Results Summary")
    print(f"   Tests Run: {tester.tests_run}")
    print(f"   Tests Passed: {tester.tests_passed}")
    print(f"   Tests Failed: {tester.tests_run - tester.tests_passed}")
    print(f"   Success Rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if tester.created_rooms:
        print(f"   Created Rooms: {tester.created_rooms}")

    # Return exit code
    if tester.tests_passed == tester.tests_run:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {tester.tests_run - tester.tests_passed} test(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())