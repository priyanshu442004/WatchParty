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
  Settings
} from 'lucide-react';
import io from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [userName, setUserName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [isInRoom, setIsInRoom] = useState(false);
  const [participants, setParticipants] = useState({});
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [peerConnections, setPeerConnections] = useState({});
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [showJoinRoom, setShowJoinRoom] = useState(false);
  
  const localVideoRef = useRef();
  const remoteVideoRefs = useRef({});

  // WebRTC Configuration
  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  useEffect(() => {
    // Load available rooms
    loadAvailableRooms();
    
    // Initialize Socket.IO connection
    const newSocket = io(BACKEND_URL);
    setSocket(newSocket);

    newSocket.on('connected', (data) => {
      console.log('Connected to server:', data.message);
    });

    newSocket.on('room_joined', async (data) => {
      console.log('Joined room:', data);
      setIsInRoom(true);
      setParticipants(data.participants);
      
      // Start local media
      await startLocalMedia();
      
      // Create peer connections for existing participants
      Object.keys(data.participants).forEach(participantId => {
        createPeerConnection(participantId, true); // We are the caller
      });
    });

    newSocket.on('user_joined', async (data) => {
      console.log('User joined:', data);
      setParticipants(prev => ({
        ...prev,
        [data.user_id]: { name: data.user_name, video_enabled: true, audio_enabled: true }
      }));
      
      // Create peer connection for new participant
      createPeerConnection(data.user_id, false); // They will call us
    });

    newSocket.on('user_left', (data) => {
      console.log('User left:', data);
      setParticipants(prev => {
        const newParticipants = { ...prev };
        delete newParticipants[data.user_id];
        return newParticipants;
      });
      
      // Clean up peer connection
      cleanupPeerConnection(data.user_id);
    });

    newSocket.on('webrtc_offer', async (data) => {
      console.log('Received offer from:', data.from_id);
      await handleOffer(data.from_id, data.offer);
    });

    newSocket.on('webrtc_answer', async (data) => {
      console.log('Received answer from:', data.from_id);
      await handleAnswer(data.from_id, data.answer);
    });

    newSocket.on('webrtc_ice_candidate', async (data) => {
      console.log('Received ICE candidate from:', data.from_id);
      await handleIceCandidate(data.from_id, data.candidate);
    });

    newSocket.on('user_video_toggle', (data) => {
      setParticipants(prev => ({
        ...prev,
        [data.user_id]: { ...prev[data.user_id], video_enabled: data.enabled }
      }));
    });

    newSocket.on('user_audio_toggle', (data) => {
      setParticipants(prev => ({
        ...prev,
        [data.user_id]: { ...prev[data.user_id], audio_enabled: data.enabled }
      }));
    });

    return () => {
      newSocket.close();
      localStream?.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
    }
  };

  const createPeerConnection = async (participantId, shouldCreateOffer) => {
    const pc = new RTCPeerConnection(rtcConfig);
    
    // Add local stream to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }
    
    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('Received remote stream from:', participantId);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({
        ...prev,
        [participantId]: remoteStream
      }));
      
      // Set remote video element
      if (remoteVideoRefs.current[participantId]) {
        remoteVideoRefs.current[participantId].srcObject = remoteStream;
      }
    };
    
    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc_ice_candidate', {
          target_id: participantId,
          candidate: event.candidate
        });
      }
    };
    
    setPeerConnections(prev => ({
      ...prev,
      [participantId]: pc
    }));
    
    if (shouldCreateOffer) {
      // Create and send offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket.emit('webrtc_offer', {
        target_id: participantId,
        offer: offer
      });
    }
  };

  const handleOffer = async (fromId, offer) => {
    const pc = peerConnections[fromId];
    if (pc) {
      await pc.setRemoteDescription(offer);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket.emit('webrtc_answer', {
        target_id: fromId,
        answer: answer
      });
    }
  };

  const handleAnswer = async (fromId, answer) => {
    const pc = peerConnections[fromId];
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  };

  const handleIceCandidate = async (fromId, candidate) => {
    const pc = peerConnections[fromId];
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  };

  const cleanupPeerConnection = (participantId) => {
    const pc = peerConnections[participantId];
    if (pc) {
      pc.close();
      setPeerConnections(prev => {
        const newConnections = { ...prev };
        delete newConnections[participantId];
        return newConnections;
      });
    }
    
    setRemoteStreams(prev => {
      const newStreams = { ...prev };
      delete newStreams[participantId];
      return newStreams;
    });
  };

  const createRoom = async () => {
    if (!roomName.trim()) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName })
      });
      
      const newRoom = await response.json();
      setRoom(newRoom);
      joinRoom(newRoom.id);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const joinRoom = (roomId) => {
    if (!userName.trim() || !roomId) return;
    
    socket.emit('join_room', {
      room_id: roomId,
      user_name: userName
    });
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isVideoEnabled;
        setIsVideoEnabled(!isVideoEnabled);
        
        socket.emit('toggle_video', { enabled: !isVideoEnabled });
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isAudioEnabled;
        setIsAudioEnabled(!isAudioEnabled);
        
        socket.emit('toggle_audio', { enabled: !isAudioEnabled });
      }
    }
  };

  const startScreenShare = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // This will capture system audio
      });
      
      // Replace video track in all peer connections
      const videoTrack = screenStream.getVideoTracks()[0];
      const audioTrack = screenStream.getAudioTracks()[0];
      
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
        
        if (audioTrack) {
          const audioSender = pc.getSenders().find(s => 
            s.track && s.track.kind === 'audio'
          );
          if (audioSender) {
            audioSender.replaceTrack(audioTrack);
          }
        }
      });
      
      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = screenStream;
      }
      
      setIsScreenSharing(true);
      socket.emit('start_screen_share', {});
      
      // Handle screen share end
      videoTrack.onended = () => {
        stopScreenShare();
      };
      
    } catch (error) {
      console.error('Error starting screen share:', error);
    }
  };

  const stopScreenShare = async () => {
    try {
      // Get camera stream again
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      
      // Replace tracks back to camera
      const videoTrack = cameraStream.getVideoTracks()[0];
      const audioTrack = cameraStream.getAudioTracks()[0];
      
      Object.values(peerConnections).forEach(pc => {
        const sender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
        
        const audioSender = pc.getSenders().find(s => 
          s.track && s.track.kind === 'audio'
        );
        if (audioSender) {
          audioSender.replaceTrack(audioTrack);
        }
      });
      
      // Update local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = cameraStream;
      }
      
      setLocalStream(cameraStream);
      setIsScreenSharing(false);
      socket.emit('stop_screen_share', {});
      
    } catch (error) {
      console.error('Error stopping screen share:', error);
    }
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
            {Object.keys(participants).length + 1} participants
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
        </div>
      </div>

      {/* Video Grid */}
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

        {/* Remote Videos */}
        {Object.entries(participants).map(([participantId, participant]) => (
          <Card key={participantId} className="bg-white/10 backdrop-blur-md border-white/20">
            <CardContent className="p-4">
              <div className="relative rounded-lg overflow-hidden bg-slate-800 aspect-video">
                <video
                  ref={el => remoteVideoRefs.current[participantId] = el}
                  autoPlay
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-white text-sm">
                  {participant.name}
                </div>
                {!participant.video_enabled && (
                  <div className="absolute inset-0 bg-slate-800 flex items-center justify-center">
                    <VideoOff className="w-12 h-12 text-white/50" />
                  </div>
                )}
                <div className="absolute top-2 right-2 flex space-x-1">
                  {!participant.audio_enabled && (
                    <MicOff className="w-4 h-4 text-red-400" />
                  )}
                  {participant.screen_sharing && (
                    <Monitor className="w-4 h-4 text-green-400" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default App;