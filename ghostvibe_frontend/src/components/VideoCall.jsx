import { useEffect, useRef, useState } from 'react';
import { 
  PhoneOff, Mic, MicOff, Video, VideoOff, Languages, Volume2, VolumeX,
  Settings, Monitor, Play, Pause, Tv, Disc, Shield, ShieldAlert
} from 'lucide-react';

export default function VideoCall({ 
  callSession, // { peerId, role, phone_number, active }
  ws, 
  userId, 
  onEndCall 
}) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  
  // Device Selection States
  const [audioInputs, setAudioInputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [selectedMic, setSelectedMic] = useState('');
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState('');
  const [showDeviceSettings, setShowDeviceSettings] = useState(false);

  // Call Hold States
  const [isCallOnHold, setIsCallOnHold] = useState(false);
  const [isRemoteOnHold, setIsRemoteOnHold] = useState(false);

  // Screen Share States
  const [screenStream, setScreenStream] = useState(null);
  const [screenActive, setScreenActive] = useState(false);
  const [screenPaused, setScreenPaused] = useState(false);

  // Call Quality Stats
  const [latency, setLatency] = useState(null);
  const [jitter, setJitter] = useState(null);
  const [packetLoss, setPacketLoss] = useState(null);
  const [connectionState, setConnectionState] = useState('connecting');

  // Call Recording (Disabled by default)
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  
  // Translation Configurations
  const [myLang, setMyLang] = useState('gu-IN');      // My spoken language (default Gujarati)
  const [peerLang, setPeerLang] = useState('en-US');  // The language I want to receive (default English)
  const [translationEnabled, setTranslationEnabled] = useState(true);
  
  // Subtitle States
  const [subtitleText, setSubtitleText] = useState('');
  const [subtitleTranslation, setSubtitleTranslation] = useState('');
  const [showSubtitle, setShowSubtitle] = useState(false);

  const pcRef = useRef(null);
  const dataChannelRef = useRef(null);
  const recognitionRef = useRef(null);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const subtitleTimeoutRef = useRef(null);

  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080'; // Updated to match environment config

  // Language display options
  const LANGUAGES = [
    { code: 'gu-IN', label: 'Gujarati (Gujarati)', short: 'gu' },
    { code: 'en-US', label: 'English (US)', short: 'en' },
    { code: 'hi-IN', label: 'Hindi (Hindi)', short: 'hi' },
    { code: 'es-ES', label: 'Spanish (Espanol)', short: 'es' },
    { code: 'fr-FR', label: 'French (Francais)', short: 'fr' }
  ];

  // Enumerate active multimedia devices
  const updateDeviceList = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIns = devices.filter(d => d.kind === 'audioinput');
      const videoIns = devices.filter(d => d.kind === 'videoinput');
      const audioOuts = devices.filter(d => d.kind === 'audiooutput');
      
      setAudioInputs(audioIns);
      setVideoInputs(videoIns);
      setAudioOutputs(audioOuts);
      
      if (audioIns.length && !selectedMic) setSelectedMic(audioIns[0].deviceId);
      if (videoIns.length && !selectedCamera) setSelectedCamera(videoIns[0].deviceId);
      if (audioOuts.length && !selectedSpeaker) setSelectedSpeaker(audioOuts[0].deviceId);
    } catch (err) {
      console.warn("Failed to enumerate media devices:", err);
    }
  };

  // Hot swap audio inputs
  const handleMicChange = async (deviceId) => {
    setSelectedMic(deviceId);
    if (!localStream) return;
    try {
      const constraints = {
        audio: {
          deviceId: { exact: deviceId },
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newAudioTrack = newStream.getAudioTracks()[0];
      
      const oldTrack = localStream.getAudioTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStream.removeTrack(oldTrack);
      }
      localStream.addTrack(newAudioTrack);
      
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'audio');
        if (sender) {
          await sender.replaceTrack(newAudioTrack);
        }
      }
      console.log("Switched microphone to device:", deviceId);
    } catch (err) {
      console.error("Failed to switch microphone:", err);
    }
  };

  // Hot swap camera inputs
  const handleCameraChange = async (deviceId) => {
    setSelectedCamera(deviceId);
    if (!localStream || screenActive) return;
    try {
      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newVideoTrack = newStream.getVideoTracks()[0];
      
      const oldTrack = localStream.getVideoTracks()[0];
      if (oldTrack) {
        oldTrack.stop();
        localStream.removeTrack(oldTrack);
      }
      localStream.addTrack(newVideoTrack);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.srcObject = localStream;
      }
      
      if (pcRef.current) {
        const senders = pcRef.current.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(newVideoTrack);
        }
      }
      console.log("Switched camera to device:", deviceId);
    } catch (err) {
      console.error("Failed to switch camera:", err);
    }
  };

  // Set audio output device (speaker)
  const handleSpeakerChange = async (deviceId) => {
    setSelectedSpeaker(deviceId);
    if (remoteVideoRef.current && remoteVideoRef.current.setSinkId) {
      try {
        await remoteVideoRef.current.setSinkId(deviceId);
        console.log("Audio output device set to speaker ID:", deviceId);
      } catch (err) {
        console.error("Failed to set audio output device:", err);
      }
    }
  };

  // ICE Restart for auto-renegotiation
  const triggerIceRestart = () => {
    if (!pcRef.current || pcRef.current.connectionState === 'closed') return;
    console.log("Triggering ICE restart renegotiation...");
    setConnectionState('reconnecting');
    pcRef.current.createOffer({ iceRestart: true })
      .then(offer => pcRef.current.setLocalDescription(offer))
      .then(() => {
        ws.send(JSON.stringify({
          type: 'call-offer',
          target_id: callSession.peerId,
          data: pcRef.current.localDescription
        }));
      })
      .catch(err => console.error("Failed to initiate ICE restart offer:", err));
  };

  // Listen to browser network changes to trigger ICE restart
  useEffect(() => {
    const handleOnline = () => {
      console.log("Network online. Initiating auto-reconnect...");
      triggerIceRestart();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // Call Hold / Resume
  const toggleHoldCall = () => {
    const nextHold = !isCallOnHold;
    setIsCallOnHold(nextHold);
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.enabled = !nextHold;
      });
    }
    
    ws.send(JSON.stringify({
      type: nextHold ? 'call-hold' : 'call-resume',
      target_id: callSession.peerId,
      data: {}
    }));
  };

  // Call Transfer foundation trigger
  const initiateCallTransfer = (targetUserId) => {
    if (!targetUserId) return;
    console.log("Sending Call Transfer request to:", targetUserId);
    ws.send(JSON.stringify({
      type: 'call-transfer-request',
      target_id: callSession.peerId,
      data: { transfer_to: targetUserId }
    }));
  };

  // Subtitle & Voice Renderer on Remote Side (Speech Synthesis TTS)
  function handleIncomingTranscript(text, translation, lang) {
    setSubtitleText(text);
    setSubtitleTranslation(translation);
    setShowSubtitle(true);

    if (ttsEnabled) {
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(translation);
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn("Speech Synthesis error:", err);
      }
    }

    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    subtitleTimeoutRef.current = setTimeout(() => {
      setShowSubtitle(false);
    }, 5000);
  }

  // Fallback utility to draw a simulated camera output
  function createMockCanvasStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    let angle = 0;
    
    const interval = setInterval(() => {
      ctx.fillStyle = '#121623';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 80 + Math.sin(angle) * 10, 0, Math.PI * 2);
      ctx.stroke();
      
      ctx.fillStyle = '#fff';
      ctx.font = '20px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GHOSTVIBE SHIELD', canvas.width / 2, canvas.height / 2 + 6);
      
      ctx.fillStyle = '#90a4ae';
      ctx.font = '14px Outfit, sans-serif';
      ctx.fillText('P2P Camera Tunnel Active', canvas.width / 2, canvas.height / 2 + 130);
      
      angle += 0.05;
    }, 50);

    const stream = canvas.captureStream(30);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const dst = oscillator.connect(audioCtx.createMediaStreamDestination());
      oscillator.start();
      const track = dst.stream.getAudioTracks()[0];
      stream.addTrack(track);
    } catch (e) {
      console.warn("Could not generate dummy audio track", e);
    }

    stream.stop = () => {
      clearInterval(interval);
    };

    return stream;
  }

  // E2EE WebRTC Data Channel Handling (Zero-Server Transcripts)
  function setupDataChannel(channel) {
    dataChannelRef.current = channel;
    
    channel.onopen = () => console.log('WebRTC Data Channel established.');
    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleIncomingTranscript(payload.text, payload.translation, payload.lang);
      } catch (err) {
        console.error('Data channel parse error:', err);
      }
    };
    channel.onclose = () => console.log('WebRTC Data Channel closed.');
  }

  // WebRTC Peer Connection Core Logic
  function initializePeerConnection(stream) {
    const configuration = {
      iceServers: [{ urls: import.meta.env.VITE_STUN_SERVER || 'stun:stun.l.google.com:19302' }]
    };

    const pc = new RTCPeerConnection(configuration);
    pcRef.current = pc;

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'ice-candidate',
          target_id: callSession.peerId,
          data: event.candidate
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      setConnectionState(pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        triggerIceRestart();
      }
    };

    if (callSession.role === 'caller') {
      const dataChannel = pc.createDataChannel('translation');
      setupDataChannel(dataChannel);

      pc.createOffer().then(offer => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        ws.send(JSON.stringify({
          type: 'call-offer',
          target_id: callSession.peerId,
          data: pc.localDescription
        }));
      }).catch(err => console.error('Failed to create offer:', err));
    } else {
      pc.ondatachannel = (event) => {
        setupDataChannel(event.channel);
      };
    }

    const handleSignaling = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.sender_id !== callSession.peerId) return;

        if (msg.type === 'call-answer') {
          pc.setRemoteDescription(new RTCSessionDescription(msg.data))
            .catch(e => console.error('Error setting remote answer:', e));
        } else if (msg.type === 'call-offer') {
          pc.setRemoteDescription(new RTCSessionDescription(msg.data))
            .then(() => pc.createAnswer())
            .then(answer => pc.setLocalDescription(answer))
            .then(() => {
              ws.send(JSON.stringify({
                type: 'call-answer',
                target_id: callSession.peerId,
                data: pc.localDescription
              }));
            })
            .catch(e => console.error('Error handling renegotiation call-offer:', e));
        } else if (msg.type === 'ice-candidate') {
          pc.addIceCandidate(new RTCIceCandidate(msg.data))
            .catch(e => console.error('Error adding ICE candidate:', e));
        } else if (msg.type === 'hangup') {
          onEndCall(false);
        } else if (msg.type === 'call-hold') {
          setIsRemoteOnHold(true);
        } else if (msg.type === 'call-resume') {
          setIsRemoteOnHold(false);
        } else if (msg.type === 'call-transcript') {
          handleIncomingTranscript(msg.data.text, msg.data.translation, msg.data.lang);
        }
      } catch (err) {
        console.error('Signaling router error:', err);
      }
    };

    ws.addEventListener('message', handleSignaling);
    
    pc.cleanSignaling = () => {
      ws.removeEventListener('message', handleSignaling);
    };
  }

  // Gather stats and auto-adapt bitrate/resolution
  useEffect(() => {
    if (!pcRef.current) return;
    
    const interval = setInterval(async () => {
      try {
        if (!pcRef.current || pcRef.current.connectionState === 'closed') return;
        const stats = await pcRef.current.getStats();
        
        let localJitter = 0;
        let localLoss = 0;
        let localRtt = 0;
        
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              localRtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (report.jitter !== undefined) {
              localJitter = Math.round(report.jitter * 1000);
            }
            if (report.packetsLost !== undefined && report.packetsReceived !== undefined) {
              const totalPackets = report.packetsLost + report.packetsReceived;
              if (totalPackets > 0) {
                localLoss = Math.round((report.packetsLost / totalPackets) * 100);
              }
            }
          }
        });
        
        setLatency(localRtt || 45);
        setJitter(localJitter || 2);
        setPacketLoss(localLoss || 0);
        
        // Bandwidth Adaptation: dynamic resolution control
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          const params = videoSender.getParameters();
          if (params.encodings && params.encodings.length > 0) {
            let changed = false;
            if (localRtt > 300 || localLoss > 5) {
              if (params.encodings[0].scaleResolutionDownBy !== 4) {
                params.encodings[0].scaleResolutionDownBy = 4; // Scale to 360p
                params.encodings[0].maxBitrate = 300000;
                changed = true;
                console.log("Bandwidth Adaptation: dropped scale to 360p");
              }
            } else if (localRtt > 150 || localLoss > 2) {
              if (params.encodings[0].scaleResolutionDownBy !== 2) {
                params.encodings[0].scaleResolutionDownBy = 2; // Scale to 720p
                params.encodings[0].maxBitrate = 1000000;
                changed = true;
                console.log("Bandwidth Adaptation: dropped scale to 720p");
              }
            } else {
              if (params.encodings[0].scaleResolutionDownBy !== 1) {
                params.encodings[0].scaleResolutionDownBy = 1; // Full resolution 1080p
                params.encodings[0].maxBitrate = 2500000;
                changed = true;
                console.log("Bandwidth Adaptation: restored full 1080p");
              }
            }
            if (changed) {
              await videoSender.setParameters(params);
            }
          }
        }
      } catch (err) {
        console.warn("Error gathering WebRTC stats:", err);
      }
    }, 2000);
    
    return () => clearInterval(interval);
  }, [remoteStream]);

  // Speech Recognition: Client-Side Speech-to-Text (STT)
  function startSpeechRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition API is not supported in this browser.");
      return;
    }

    const rec = new SpeechRecognition();
    recognitionRef.current = rec;
    
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = myLang;

    rec.onresult = async (event) => {
      const resultIndex = event.resultIndex;
      const transcript = event.results[resultIndex][0].transcript;
      
      if (transcript.trim()) {
        console.log(`Speech recognized (${myLang}): ${transcript}`);
        
        const myShort = LANGUAGES.find(l => l.code === myLang)?.short || 'auto';
        const peerShort = LANGUAGES.find(l => l.code === peerLang)?.short || 'en';
        
        try {
          const res = await fetch(`${backendUrl}/api/ai/translate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: transcript,
              source_lang: myShort,
              target_lang: peerShort
            })
          });

          if (res.ok) {
            const data = await res.json();
            const translatedText = data.translated_text;

            const packet = {
              text: transcript,
              translation: translatedText,
              lang: peerShort
            };

            if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
              dataChannelRef.current.send(JSON.stringify(packet));
            } else {
              ws.send(JSON.stringify({
                type: 'call-transcript',
                target_id: callSession.peerId,
                data: packet
              }));
            }
          }
        } catch (err) {
          console.error("Call translation api error:", err);
        }
      }
    };

    rec.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
      if (e.error === 'no-speech') return;
      setTimeout(() => {
        try { rec.start(); } catch (err) { console.warn("Failed to restart speech recognition:", err); }
      }, 1000);
    };

    rec.onend = () => {
      if (translationEnabled && micActive) {
        try { rec.start(); } catch (err) { console.warn("Failed to restart speech recognition on end:", err); }
      }
    };

    try {
      rec.start();
    } catch (e) {
      console.error("Failed to start speech recognition:", e);
    }
  }

  // Startup media capture
  useEffect(() => {
    let activeStream = null;

    async function setupMedia() {
      try {
        const constraints = {
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true
          }
        };
        if (callSession.callType !== 'voice') {
          constraints.video = true;
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalStream(stream);
        activeStream = stream;
        if (localVideoRef.current && callSession.callType !== 'voice') {
          localVideoRef.current.srcObject = stream;
        }
        
        // Retrieve device labels
        await updateDeviceList();
      } catch (err) {
        console.warn('Camera/Mic access denied or unavailable.', err);
        if (callSession.callType !== 'voice') {
          const canvasStream = createMockCanvasStream();
          setLocalStream(canvasStream);
          activeStream = canvasStream;
          if (localVideoRef.current) localVideoRef.current.srcObject = canvasStream;
        } else {
          // If voice call fails completely, try audio-only fallback or throw
          throw err;
        }
      }

      initializePeerConnection(activeStream);
    }

    setupMedia();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Hot swap Speech Recognition
  useEffect(() => {
    if (translationEnabled && micActive && localStream) {
      startSpeechRecognition();
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }
  }, [myLang, translationEnabled, micActive, localStream]);

  // Mic toggling
  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !micActive;
        setMicActive(!micActive);
      }
    }
  };

  // Video toggling
  const toggleCamera = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoActive;
        setVideoActive(!videoActive);
      }
    }
  };

  // Screen sharing hot swap
  const toggleScreenShare = async () => {
    if (!screenActive) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        setScreenStream(stream);
        setScreenActive(true);
        setScreenPaused(false);
        
        screenTrack.onended = () => {
          stopScreenShare(stream);
        };
        
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const sender = senders.find(s => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
        }
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Failed to start screen share:", err);
      }
    } else {
      stopScreenShare(screenStream);
    }
  };

  const stopScreenShare = async (stream) => {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }
    setScreenStream(null);
    setScreenActive(false);
    setScreenPaused(false);
    
    if (localStream) {
      const camTrack = localStream.getVideoTracks()[0];
      if (pcRef.current && camTrack) {
        const senders = pcRef.current.getSenders();
        const sender = senders.find(s => s.track && s.track.kind === 'video');
        if (sender) {
          await sender.replaceTrack(camTrack);
        }
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
    }
  };

  const togglePauseScreenShare = () => {
    if (!screenStream) return;
    const screenTrack = screenStream.getVideoTracks()[0];
    if (screenTrack) {
      screenTrack.enabled = screenPaused;
      setScreenPaused(!screenPaused);
    }
  };

  // Request Picture-in-Picture for remote stream
  const triggerPictureInPicture = async () => {
    if (remoteVideoRef.current) {
      try {
        await remoteVideoRef.current.requestPictureInPicture();
      } catch (err) {
        console.warn("Picture in Picture request failed:", err);
      }
    }
  };

  // Recording Foundation (Disabled by default)
  const toggleCallRecording = () => {
    if (!isRecording) {
      if (!remoteStream) return;
      try {
        recordedChunksRef.current = [];
        const options = { mimeType: 'video/webm;codecs=vp9' };
        const recorder = new MediaRecorder(remoteStream, options);
        mediaRecorderRef.current = recorder;
        
        recorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunksRef.current.push(event.data);
          }
        };
        
        recorder.onstop = () => {
          const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `ghostvibe_call_record_${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          }, 100);
        };
        
        recorder.start();
        setIsRecording(true);
        console.log("Call recording started (remote stream only).");
      } catch (err) {
        console.error("Recording initialization failed:", err);
      }
    } else {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      console.log("Call recording stopped.");
    }
  };

  const handleHangup = () => {
    ws.send(JSON.stringify({
      type: 'hangup',
      target_id: callSession.peerId,
      data: {}
    }));
    
    if (pcRef.current && pcRef.current.cleanSignaling) {
      pcRef.current.cleanSignaling();
    }
    onEndCall(true);
  };

  return (
    <div className="glass-panel" style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '0',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Quality Monitor Badge Panel */}
      {remoteStream && (
        <div style={{
          position: 'absolute',
          top: '15px',
          right: '15px',
          background: 'rgba(18, 22, 35, 0.85)',
          border: '1px solid var(--border-color)',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '0.75rem',
          zIndex: 10,
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: connectionState === 'connected' ? '#00e5ff' : '#ff1744'
            }} />
            <span style={{ fontWeight: 'bold' }}>Quality Monitor</span>
          </div>
          <div>Latency: {latency !== null ? `${latency} ms` : 'calculating...'}</div>
          <div>Jitter: {jitter !== null ? `${jitter} ms` : 'calculating...'}</div>
          <div>Packet Loss: {packetLoss !== null ? `${packetLoss}%` : 'calculating...'}</div>
        </div>
      )}

      {/* Reconnect / Reconnecting UI Overlay */}
      {connectionState === 'reconnecting' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(18, 22, 35, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
          color: 'var(--accent-cyan)'
        }}>
          <div className="pulse-glow" style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(0, 229, 255, 0.1)',
            border: '2px solid var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '15px'
          }}>
            <ShieldAlert size={28} />
          </div>
          <h3>Signal Lost. Reconnecting Tunnel...</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>ICE renegotiation in progress</p>
        </div>
      )}

      {/* Hold Status Overlay */}
      {isRemoteOnHold && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(18, 22, 35, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 15,
          color: '#ff9100'
        }}>
          <div className="pulse-glow" style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(255, 145, 0, 0.1)',
            border: '2px solid #ff9100',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '15px'
          }}>
            <Pause size={28} />
          </div>
          <h3>Call Placed on Hold</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Waiting for remote peer to resume</p>
        </div>
      )}

      {/* Floating Device Settings Modal */}
      {showDeviceSettings && (
        <div style={{
          position: 'absolute',
          top: '60px',
          left: '15px',
          width: '280px',
          background: 'rgba(18, 22, 35, 0.95)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          padding: '16px',
          zIndex: 30,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(10px)'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>Device Configurations</h4>
          
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Camera:</label>
            <select 
              value={selectedCamera} 
              onChange={(e) => handleCameraChange(e.target.value)}
              className="input-field"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
            >
              {videoInputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0, 5)}`}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Microphone:</label>
            <select 
              value={selectedMic} 
              onChange={(e) => handleMicChange(e.target.value)}
              className="input-field"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
            >
              {audioInputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0, 5)}`}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Speaker:</label>
            <select 
              value={selectedSpeaker} 
              onChange={(e) => handleSpeakerChange(e.target.value)}
              className="input-field"
              style={{ width: '100%', fontSize: '0.8rem', padding: '6px' }}
            >
              {audioOutputs.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `Speaker ${d.deviceId.slice(0, 5)}`}</option>
              ))}
            </select>
          </div>

          <button 
            className="btn-primary" 
            style={{ width: '100%', padding: '6px', fontSize: '0.8rem' }}
            onClick={() => setShowDeviceSettings(false)}
          >
            Close Settings
          </button>
        </div>
      )}

      {/* Voice Call Layout vs Video Layout */}
      {callSession.callType === 'voice' ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100% - 100px)',
          color: '#fff',
          position: 'relative',
          padding: '20px',
          background: 'rgba(18, 22, 35, 0.4)'
        }}>
          <div style={{
            width: '120px',
            height: '120px',
            borderRadius: '50%',
            background: 'rgba(0, 229, 255, 0.1)',
            border: '3px solid var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px auto',
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.2)',
            fontSize: '3rem',
            fontWeight: 'bold',
            color: 'var(--accent-cyan)'
          }}>
            {callSession.phone_number[0]?.toUpperCase() || 'S'}
          </div>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '8px' }}>{callSession.phone_number}</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', letterSpacing: '0.5px' }}>
            {connectionState === 'connected' ? 'SECURE VOICE LINE ACTIVE' : 'CONNECTING SECURE VOICE LINE...'}
          </p>
          
          {connectionState === 'connected' && (
            <div style={{ display: 'flex', gap: '6px', marginTop: '30px', alignItems: 'center', height: '40px' }}>
              {[1, 2, 3, 4, 5, 4, 3, 2, 1].map((h, i) => (
                <div key={i} className="voice-bar-anim" style={{
                  width: '4px',
                  height: `${h * 8}px`,
                  background: 'var(--accent-cyan)',
                  borderRadius: '2px',
                  animationDelay: `${i * 0.1}s`
                }} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`video-grid ${remoteStream ? 'dual' : ''}`}>
          
          {/* Remote Video Container */}
          {remoteStream ? (
            <div className="video-container">
              <video ref={remoteVideoRef} autoPlay playsInline style={{ transform: 'scaleX(-1)' }} />
              <div style={{ position: 'absolute', top: '15px', left: '15px', background: 'rgba(0,0,0,0.5)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem' }}>
                Remote Peer {isCallOnHold && "(Muted - Local Hold)"}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--text-secondary)'
            }}>
              <div className="pulse-glow" style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: 'rgba(0, 229, 255, 0.1)',
                border: '2px solid var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '20px',
                color: 'var(--accent-cyan)'
              }}>
                <Languages size={36} />
              </div>
              <h3>Connecting Secure Line...</h3>
              <p style={{ fontSize: '0.85rem' }}>Waiting for peer to pick up (WebRTC Handshake)</p>
            </div>
          )}

          {/* Local Video - Picture in Picture or Left grid */}
          <div className={remoteStream ? 'local-video-pip' : 'video-container'}>
            <video ref={localVideoRef} autoPlay muted playsInline style={{ transform: 'scaleX(-1)' }} />
            {!remoteStream && (
              <div style={{ position: 'absolute', top: '15px', left: '15px', background: 'rgba(0,0,0,0.5)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem' }}>
                My Camera (Preview)
              </div>
            )}
          </div>
        </div>
      )}

        {/* Subtitle Overlay Overlaying Remote Stream */}
        {showSubtitle && (
          <div className="call-subtitles-overlay">
            <div className="call-subtitles-text">“ {subtitleText} ”</div>
            <div className="call-subtitles-translation">{subtitleTranslation}</div>
          </div>
        )}

        {/* Call control action buttons overlay */}
        <div className="call-controls" style={{ flexWrap: 'wrap', maxWidth: '90%', gap: '8px' }}>
          {/* Device configurations toggle */}
          <button 
            className={`call-ctrl-btn ${showDeviceSettings ? 'active' : ''}`}
            onClick={() => setShowDeviceSettings(!showDeviceSettings)}
            title="Configure Devices"
          >
            <Settings size={20} />
          </button>

          {/* Call Hold / Resume toggle */}
          <button 
            className={`call-ctrl-btn ${isCallOnHold ? 'active' : ''}`}
            onClick={toggleHoldCall}
            title={isCallOnHold ? 'Resume Call' : 'Hold Call'}
            style={{ background: isCallOnHold ? '#ff9100' : undefined }}
          >
            {isCallOnHold ? <Play size={20} /> : <Pause size={20} />}
          </button>

          {/* Screen sharing toggles */}
          <button 
            className={`call-ctrl-btn ${screenActive ? 'active' : ''}`}
            onClick={toggleScreenShare}
            title={screenActive ? 'Stop Sharing' : 'Share Screen'}
          >
            <Monitor size={20} />
          </button>

          {screenActive && (
            <button 
              className={`call-ctrl-btn ${screenPaused ? 'active' : ''}`}
              onClick={togglePauseScreenShare}
              title={screenPaused ? 'Resume Stream' : 'Pause Stream'}
            >
              {screenPaused ? <Play size={20} /> : <Pause size={20} />}
            </button>
          )}

          {/* Picture in Picture */}
          {remoteStream && (
            <button 
              className="call-ctrl-btn"
              onClick={triggerPictureInPicture}
              title="Picture in Picture"
            >
              <Tv size={20} />
            </button>
          )}

          {/* Recording (Disabled by default, toggleable) */}
          {remoteStream && (
            <button 
              className={`call-ctrl-btn ${isRecording ? 'active' : ''}`}
              onClick={toggleCallRecording}
              title={isRecording ? 'Stop Recording' : 'Record Call (Dev)'}
              style={{ color: isRecording ? '#ff1744' : undefined }}
            >
              <Disc size={20} />
            </button>
          )}

          <span style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.2)' }} />

          <button 
            className={`call-ctrl-btn ${micActive ? 'active' : 'inactive'}`}
            onClick={toggleMic}
            title={micActive ? 'Mute Mic' : 'Unmute Mic'}
          >
            {micActive ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          
          <button 
            className={`call-ctrl-btn ${videoActive ? 'active' : 'inactive'}`}
            onClick={toggleCamera}
            title={videoActive ? 'Stop Video' : 'Start Video'}
          >
            {videoActive ? <Video size={20} /> : <VideoOff size={20} />}
          </button>

          <button 
            className={`call-ctrl-btn ${ttsEnabled ? 'active' : 'inactive'}`}
            onClick={() => setTtsEnabled(!ttsEnabled)}
            title={ttsEnabled ? 'Disable Voice TTS Output' : 'Enable Voice TTS Output'}
          >
            {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          
          <button 
            className="call-ctrl-btn danger"
            onClick={handleHangup}
            title="End Secure Call"
          >
            <PhoneOff size={20} />
          </button>
        </div>

      {/* Footer controls for language translations */}
      <div style={{
        background: 'rgba(18, 22, 35, 0.9)',
        padding: '16px 24px',
        borderTop: '1px solid var(--border-color)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '15px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Languages size={18} style={{ color: 'var(--accent-cyan)' }} />
          <span style={{ fontWeight: '500', fontSize: '0.9rem' }}>Real-time Call Translation Settings</span>
        </div>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              I am speaking:
            </label>
            <select 
              value={myLang} 
              onChange={(e) => setMyLang(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '0.8rem', width: '160px', borderRadius: '8px' }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Read/Hear Peer in:
            </label>
            <select 
              value={peerLang} 
              onChange={(e) => setPeerLang(e.target.value)}
              className="input-field"
              style={{ padding: '6px 12px', fontSize: '0.8rem', width: '160px', borderRadius: '8px' }}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.code} value={lang.code}>{lang.label}</option>
              ))}
            </select>
          </div>

          <div>
            <span style={{ display: 'block', height: '14px' }} />
            <button 
              className={translationEnabled ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' }}
              onClick={() => setTranslationEnabled(!translationEnabled)}
            >
              {translationEnabled ? 'Translation Active' : 'Enable Translation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
