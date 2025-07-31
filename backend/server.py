from fastapi import FastAPI, APIRouter
from fastapi.responses import HTMLResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Any
import uuid
from datetime import datetime
import socketio
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create Socket.IO server
sio = socketio.AsyncServer(
    cors_allowed_origins="*",
    logger=True,
    engineio_logger=True
)

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Store active rooms and participants
active_rooms: Dict[str, Dict[str, Any]] = {}
user_rooms: Dict[str, str] = {}  # socket_id -> room_id mapping

# Define Models
class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    participant_count: int = 0

class RoomCreate(BaseModel):
    name: str

class JoinRoom(BaseModel):
    room_id: str
    user_name: str

# Socket.IO Events
@sio.event
async def connect(sid, environ):
    print(f"Client {sid} connected")
    await sio.emit('connected', {'message': 'Connected successfully'}, room=sid)

@sio.event
async def disconnect(sid):
    print(f"Client {sid} disconnected")
    
    # Remove user from room if they were in one
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_rooms and sid in active_rooms[room_id]['participants']:
            active_rooms[room_id]['participants'].pop(sid)
            active_rooms[room_id]['participant_count'] -= 1
            
            # Notify other participants
            await sio.emit('user_left', {'user_id': sid}, room=room_id)
            
            # Remove room if empty
            if active_rooms[room_id]['participant_count'] == 0:
                active_rooms.pop(room_id)
        
        user_rooms.pop(sid)

@sio.event
async def join_room(sid, data):
    room_id = data['room_id']
    user_name = data['user_name']
    
    # Create room if it doesn't exist
    if room_id not in active_rooms:
        active_rooms[room_id] = {
            'participants': {},
            'participant_count': 0,
            'created_at': datetime.utcnow()
        }
    
    # Add user to room
    active_rooms[room_id]['participants'][sid] = {
        'name': user_name,
        'video_enabled': True,
        'audio_enabled': True,
        'screen_sharing': False
    }
    active_rooms[room_id]['participant_count'] += 1
    user_rooms[sid] = room_id
    
    # Join socket room
    await sio.enter_room(sid, room_id)
    
    # Send current participants to new user
    participants = {
        k: v for k, v in active_rooms[room_id]['participants'].items() 
        if k != sid
    }
    await sio.emit('room_joined', {
        'room_id': room_id,
        'participants': participants
    }, room=sid)
    
    # Notify other participants
    await sio.emit('user_joined', {
        'user_id': sid,
        'user_name': user_name
    }, room=room_id, skip_sid=sid)

@sio.event
async def webrtc_offer(sid, data):
    """Handle WebRTC offer"""
    target_id = data['target_id']
    offer = data['offer']
    
    await sio.emit('webrtc_offer', {
        'from_id': sid,
        'offer': offer
    }, room=target_id)

@sio.event
async def webrtc_answer(sid, data):
    """Handle WebRTC answer"""
    target_id = data['target_id']
    answer = data['answer']
    
    await sio.emit('webrtc_answer', {
        'from_id': sid,
        'answer': answer
    }, room=target_id)

@sio.event
async def webrtc_ice_candidate(sid, data):
    """Handle ICE candidates"""
    target_id = data['target_id']
    candidate = data['candidate']
    
    await sio.emit('webrtc_ice_candidate', {
        'from_id': sid,
        'candidate': candidate
    }, room=target_id)

@sio.event
async def toggle_video(sid, data):
    """Toggle video on/off"""
    video_enabled = data['enabled']
    
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_rooms and sid in active_rooms[room_id]['participants']:
            active_rooms[room_id]['participants'][sid]['video_enabled'] = video_enabled
            
            # Notify other participants
            await sio.emit('user_video_toggle', {
                'user_id': sid,
                'enabled': video_enabled
            }, room=room_id, skip_sid=sid)

@sio.event
async def toggle_audio(sid, data):
    """Toggle audio on/off"""
    audio_enabled = data['enabled']
    
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_rooms and sid in active_rooms[room_id]['participants']:
            active_rooms[room_id]['participants'][sid]['audio_enabled'] = audio_enabled
            
            # Notify other participants
            await sio.emit('user_audio_toggle', {
                'user_id': sid,
                'enabled': audio_enabled
            }, room=room_id, skip_sid=sid)

@sio.event
async def start_screen_share(sid, data):
    """Start screen sharing"""
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_rooms and sid in active_rooms[room_id]['participants']:
            active_rooms[room_id]['participants'][sid]['screen_sharing'] = True
            
            # Notify other participants
            await sio.emit('user_screen_share_start', {
                'user_id': sid
            }, room=room_id, skip_sid=sid)

@sio.event
async def stop_screen_share(sid, data):
    """Stop screen sharing"""
    if sid in user_rooms:
        room_id = user_rooms[sid]
        if room_id in active_rooms and sid in active_rooms[room_id]['participants']:
            active_rooms[room_id]['participants'][sid]['screen_sharing'] = False
            
            # Notify other participants
            await sio.emit('user_screen_share_stop', {
                'user_id': sid
            }, room=room_id, skip_sid=sid)

# API Routes
@api_router.get("/")
async def root():
    return {"message": "WatchTogether API"}

@api_router.post("/rooms", response_model=Room)
async def create_room(room_data: RoomCreate):
    """Create a new room"""
    room = Room(name=room_data.name)
    
    # Store in database
    await db.rooms.insert_one(room.dict())
    
    return room

@api_router.get("/rooms", response_model=List[Room])
async def get_rooms():
    """Get all available rooms"""
    rooms = await db.rooms.find().to_list(100)
    return [Room(**room) for room in rooms]

@api_router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    """Get room details and current participants"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        return {"error": "Room not found"}
    
    participants = []
    if room_id in active_rooms:
        participants = [
            {"id": k, **v} for k, v in active_rooms[room_id]['participants'].items()
        ]
    
    return {
        "room": Room(**room),
        "participants": participants,
        "participant_count": len(participants)
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

# Mount Socket.IO - use a different approach for compatibility
app = socketio.ASGIApp(sio, other_asgi_app=app)