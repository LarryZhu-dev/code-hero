
import mqtt from 'mqtt';
import { BattleState, CharacterConfig } from '../types';

const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

type MessageHandler = (topic: string, payload: any) => void;

// Helper for generating IDs if crypto.randomUUID is not available
const generateId = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

export class NetworkService {
    client: mqtt.MqttClient | null = null;
    roomId: string = '';
    playerId: string = '';
    onMessage: MessageHandler = () => {};
    isPublicHall: boolean = false;

    constructor() {
        this.playerId = generateId().slice(0, 8);
    }

    isConnected(): boolean {
        return this.client?.connected || false;
    }

    connect(roomId: string, onMessage: MessageHandler, onConnect?: () => void, isPublicHall: boolean = false) {
        this.disconnect(); // Ensure previous connection is closed

        this.roomId = roomId;
        this.onMessage = onMessage;
        this.isPublicHall = isPublicHall;

        // Reuse ID for reconnection stability
        this.client = mqtt.connect(BROKER_URL, {
            clientId: `cw_client_${this.playerId}_${Math.random().toString(16).slice(2, 5)}`,
            clean: true,
            keepalive: 30,
            // Last Will and Testament: Automatically publish 'leave' if connection is lost
            will: {
                topic: `cw/room/${roomId}/leave`,
                payload: JSON.stringify({ sender: this.playerId, id: this.playerId }),
                qos: 0,
                retain: false
            }
        });

        this.client.on('connect', () => {
            console.log(`Connected to MQTT Broker [${roomId}]`);
            this.client?.subscribe(`cw/room/${roomId}/#`, (err) => {
                if (!err) {
                    if (isPublicHall) {
                        this.publish('presence_request', {}); // Ask who is here
                    } else {
                        this.publish('join', { id: this.playerId });
                    }
                    if (onConnect) onConnect();
                }
            });
        });

        this.client.on('message', (topic, msg) => {
            try {
                const data = JSON.parse(msg.toString());
                // Ignore my own messages
                if (data.sender === this.playerId) return;
                
                // Extract action from topic: cw/room/{id}/{action}
                const parts = topic.split('/');
                const action = parts[parts.length - 1];
                
                this.onMessage(action, data);
            } catch (e) {
                console.error('MQTT Parse Error', e);
            }
        });

        this.client.on('error', (err) => {
            console.error('MQTT Error', err);
        });
    }

    publish(action: string, data: any) {
        if (this.client && this.roomId) {
            this.client.publish(`cw/room/${this.roomId}/${action}`, JSON.stringify({
                sender: this.playerId,
                ...data
            }));
        }
    }

    disconnect() {
        if (this.client) {
            this.publish('leave', { id: this.playerId });
            this.client.end();
            this.client = null;
            this.roomId = '';
            this.isPublicHall = false;
        }
    }
    
    // Battle / Lobby Methods
    sendState(state: BattleState) {
        this.publish('sync_state', { state });
    }
    
    sendHandshake(char: CharacterConfig, isHost: boolean) {
        this.publish('handshake', { char, isHost });
    }

    sendReady(ready: boolean) {
        this.publish('ready', { ready });
    }

    sendRematch() {
        this.publish('rematch_request', {});
    }

    // Public Hall Methods
    announcePresence(playerInfo: { name: string, char: CharacterConfig, status: string }) {
        this.publish('presence', playerInfo);
    }

    sendChallenge(targetId: string, challengerName: string) {
        this.publish('challenge', { targetId, challengerName });
    }

    respondChallenge(targetId: string, accept: boolean, privateRoomId?: string) {
        this.publish('challenge_response', { targetId, accept, privateRoomId });
    }
}

export const net = new NetworkService();
