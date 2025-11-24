
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

    constructor() {
        this.playerId = generateId().slice(0, 8);
    }

    connect(roomId: string, onMessage: MessageHandler, onConnect?: () => void) {
        this.roomId = roomId;
        this.onMessage = onMessage;

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
            console.log('Connected to MQTT Broker');
            this.client?.subscribe(`cw/room/${roomId}/#`, (err) => {
                if (!err) {
                    this.publish('join', { id: this.playerId });
                    // Notify caller that we are ready to send messages
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
        }
    }
    
    sendState(state: BattleState) {
        this.publish('sync_state', { state });
    }
    
    sendHandshake(char: CharacterConfig, isHost: boolean) {
        this.publish('handshake', { char, isHost });
    }

    sendReady(ready: boolean) {
        this.publish('ready', { ready });
    }
}

export const net = new NetworkService();
