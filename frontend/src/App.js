import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Badge } from './components/ui/badge';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Monitor, 
  MonitorOff,
  Phone,
  Users,
  AlertCircle
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [room, setRoom] = useState(null);
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  const [mediaPermissionGranted, setMediaPermissionGranted] = useState(false);
  const [roomInfo, setRoomInfo] = useState(null);
  
  const localVideoRef = useRef();

  const loadAvailableRooms = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms`);
      const rooms = await response.json();
      setAvailableRooms(rooms);
    } catch (error) {
      console.error('Error loading rooms:', error);
    }
  };

  useEffect(() => {
    loadAvailableRooms();
  }, []);

  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      setMediaPermissionGranted(true);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Camera and microphone access is required for video calling. Please grant permissions and try again.');
    }
  };

  const createRoom = async () => {
    if (!userName.trim() || !roomName.trim()) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName })
      });
      
      const newRoom = await response.json();
      setRoom(newRoom);
      setRoomInfo(newRoom);
      
      // Start media and enter room
      await startLocalMedia();
      setIsInRoom(true);
      
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const joinExistingRoom = async (selectedRoomId) => {
    if (!userName.trim()) return;
    
    try {
      // Get room details
      const response = await fetch(`${BACKEND_URL}/api/rooms/${selectedRoomId}`);
      const roomData = await response.json();
      
      if (roomData.room) {
        setRoom(roomData.room);
        setRoomInfo(roomData.room);
        
        // Start media and enter room
        await startLocalMedia();
        setIsInRoom(true);
      }
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // This captures system audio from Netflix/streaming
      });
      
      // Update local video to show screen
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      
      setLocalStream(screenStream);
      setIsScreenSharing(true);
      
      // Handle screen share end
      const videoTrack = screenStream.getVideoTracks()[0];
      videoTrack.onended = () => {
        stopScreenShare();
      };
      
    } catch (error) {
      console.error('Error starting screen share:', error);
      alert('Screen sharing permission denied. Please allow screen sharing to stream Netflix and other content.');
    }
  };

  const stopScreenShare = async () => {
    try {
      // Stop current screen stream
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      
      // Get camera stream again
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Update local video back to camera
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = cameraStream;
      }
      
      setLocalStream(cameraStream);
      setIsScreenSharing(false);
      
    } catch (error) {
      console.error('Error stopping screen share:', error);
    }
  };

  const leaveRoom = () => {
    // Stop all media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    setIsInRoom(false);
    setRoom(null);
    setRoomInfo(null);
    setLocalStream(null);
    setIsScreenSharing(false);
    setMediaPermissionGranted(false);
  };

  if (!isInRoom) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-white text-center">
              WatchTogether
            </CardTitle>
            <p className="text-white/70 text-center">
              Video call and stream movies together
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Input
                placeholder="Your name"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            {!showJoinRoom ? (
              // Create Room Mode
              <>
                <div>
                  <Input
                    placeholder="Room name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                  />
                </div>
                <Button 
                  onClick={createRoom}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  disabled={!userName.trim() || !roomName.trim()}
                >
                  Create Room
                </Button>
                <div className="text-center">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowJoinRoom(true)}
                    className="text-white/70 hover:text-white"
                  >
                    Or join existing room
                  </Button>
                </div>
              </>
            ) : (
              // Join Room Mode
              <>
                <div className="space-y-2">
                  <p className="text-white/70 text-sm">Available Rooms:</p>
                  <div className="max-h-32 overflow-y-auto space-y-2">
                    {availableRooms.length > 0 ? (
                      availableRooms.map((room) => (
                        <div 
                          key={room.id}
                          className="bg-white/5 border border-white/10 rounded-lg p-3 cursor-pointer hover:bg-white/10 transition-colors"
                          onClick={() => joinExistingRoom(room.id)}
                        >
                          <p className="text-white font-medium">{room.name}</p>
                          <p className="text-white/50 text-xs">
                            Created {new Date(room.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-white/50 text-sm text-center py-4">
                        No rooms available. Create one instead!
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-center space-y-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setShowJoinRoom(false)}
                    className="text-white/70 hover:text-white"
                  >
                    Create new room instead
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={loadAvailableRooms}
                    className="w-full border-white/20 text-white hover:bg-white/10"
                  >
                    Refresh Rooms
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <h1 className="text-2xl font-bold text-white">WatchTogether</h1>
          <Badge variant="secondary" className="bg-white/10 text-white">
            <Users className="w-4 h-4 mr-1" />
            Room: {roomInfo?.name}
          </Badge>
        </div>
        
        {/* Controls */}
        <div className="flex items-center space-x-2">
          <Button
            variant={isVideoEnabled ? "default" : "destructive"}
            size="sm"
            onClick={toggleVideo}
          >
            {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>
          
          <Button
            variant={isAudioEnabled ? "default" : "destructive"}
            size="sm"
            onClick={toggleAudio}
          >
            {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
          
          <Button
            variant={isScreenSharing ? "destructive" : "default"}
            size="sm"
            onClick={isScreenSharing ? stopScreenShare : startScreenShare}
          >
            {isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
          </Button>
          
          <Button
            variant="destructive"
            size="sm"
            onClick={leaveRoom}
          >
            <Phone className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Video Interface */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Local Video */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardContent className="p-4">
            <div className="relative rounded-lg overflow-hidden bg-slate-800 aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
              <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                You {isScreenSharing && '(Screen)'}
              </div>
              {!isVideoEnabled && (
                <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                  <VideoOff className="w-12 h-12 text-white/50" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Placeholder for other participants */}
        <Card className="bg-white/10 backdrop-blur-md border-white/20">
          <CardContent className="p-4">
            <div className="relative rounded-lg overflow-hidden bg-slate-800 aspect-video flex items-center justify-center">
              <div className="text-center text-white/70">
                <AlertCircle className="w-16 h-16 mx-auto mb-4" />
                <p className="text-lg font-medium">Waiting for participants...</p>
                <p className="text-sm mt-2">
                  Share this room name with friends:<br />
                  <span className="font-mono bg-white/10 px-2 py-1 rounded">
                    {roomInfo?.name}
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Card className="mt-6 bg-white/10 backdrop-blur-md border-white/20">
        <CardContent className="p-4">
          <h3 className="text-white font-semibold mb-2">How to watch Netflix together:</h3>
          <ol className="text-white/70 text-sm space-y-1">
            <li>1. Click the <Monitor className="w-4 h-4 inline mx-1" /> screen share button</li>
            <li>2. Select your Netflix browser tab and check "Share audio"</li>
            <li>3. Start your movie - everyone will see and hear it!</li>
            <li>4. Use video/audio controls to mute yourself while watching</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export default App;