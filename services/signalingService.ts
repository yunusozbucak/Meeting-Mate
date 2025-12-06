import { SignalMessage } from '../types';
import Peer, { DataConnection } from 'peerjs';

// Generate a random 4-character ID for easier typing on mobile
const generateShortId = () => Math.random().toString(36).substring(2, 6).toUpperCase();
const APP_PREFIX = 'meeting-mate-';

class SignalingServiceImpl {
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private onMessageCallback: ((msg: SignalMessage) => void) | null = null;
  public myId: string = '';

  // Initialize as Host
  async initHost(): Promise<string> {
    const shortId = generateShortId();
    this.myId = shortId;
    
    return new Promise((resolve, reject) => {
      // Create a peer with a predictable ID based on the short code
      const peer = new Peer(`${APP_PREFIX}${shortId}`);

      peer.on('open', (id) => {
        console.log('Host initialized:', id);
        this.peer = peer;
        resolve(shortId);
      });

      peer.on('connection', (conn) => {
        console.log('Client connected:', conn.peer);
        this.connections.push(conn);
        
        conn.on('data', (data) => {
            // Echo logic if needed, currently Host primarily broadcasts
        });

        conn.on('close', () => {
             this.connections = this.connections.filter(c => c !== conn);
        });
      });

      peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        // If ID taken (rare with random), retry or reject
        if(err.type === 'unavailable-id') {
            this.initHost().then(resolve).catch(reject);
        } else {
            reject(err);
        }
      });
    });
  }

  // Connect as Client
  async joinSession(hostId: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(); // Client gets random ID
      
      peer.on('open', () => {
        const conn = peer.connect(`${APP_PREFIX}${hostId.toUpperCase()}`);
        
        conn.on('open', () => {
          console.log('Connected to Host');
          this.connections.push(conn);
          this.peer = peer;
          resolve(true);
        });

        conn.on('data', (data: any) => {
           if (this.onMessageCallback) {
               this.onMessageCallback(data as SignalMessage);
           }
        });

        conn.on('error', (err) => {
            console.error("Connection Error", err);
            reject(err);
        });

        // Timeout fallback
        setTimeout(() => {
            if (!conn.open) reject(new Error("Connection timed out"));
        }, 5000);
      });

      peer.on('error', (err) => reject(err));
    });
  }

  // Send message to all connected peers
  broadcast(gesture: 'NOD' | 'SHAKE') {
    const message: SignalMessage = {
      type: 'GESTURE_DETECTED',
      gesture,
      timestamp: Date.now(),
      senderId: this.myId || 'HOST',
    };

    this.connections.forEach(conn => {
        if(conn.open) {
            conn.send(message);
        }
    });
  }

  listen(callback: (message: SignalMessage) => void) {
    this.onMessageCallback = callback;
    return () => {
        this.onMessageCallback = null;
    };
  }

  cleanup() {
    this.connections.forEach(c => c.close());
    this.peer?.destroy();
    this.connections = [];
    this.peer = null;
  }
}

export const SignalingService = new SignalingServiceImpl();